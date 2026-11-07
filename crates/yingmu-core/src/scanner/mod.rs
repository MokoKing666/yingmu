//! scanner — 递归扫描、指纹、去重、增量扫描、断点恢复、可取消、进度事件
//!
//! # 媒体探测诚实性（强制）
//! 当前**没有 FFmpeg / libmpv 绑定**，[`MediaProbe`] 的默认实现 [`NoopMediaProbe`]
//! 只返回「探测不可用」，**绝不伪造**时长 / 分辨率 / 编码 / HDR 等探测结果。
//! 扫描器只能识别：路径、扩展名、大小、修改时间、（部分）内容指纹。
//!
//! # 增量与断点
//! - 增量决策依据 `size + mtime + fingerprint` 三者（见 [`decide`]）。
//! - 断点恢复用 [`ScanCursor`]：记录上次已处理到的最后一个相对路径（字典序），
//!   续扫时跳过 `<=` 该路径的文件，目录仍递归以发现新增文件。
//! - 删除/移动检测见 [`reconcile`]。
//!
//! 本模块源码未经编译验证：Rust 工具链 1.99.1 已安装（未在 PATH），但 MSVC / Windows SDK / link.exe 缺失；不得视为可运行实现。

use crate::models::{ScanProgress, ScanState};
use crate::providers::{DirEntry, MediaProvider, MediaReader};
use crate::Result;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::{HashMap, HashSet};
use std::io::SeekFrom;
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

/// 常见视频容器扩展名（小写）。ISO 镜像/BDMV 目录不在「单文件视频」范围内，
/// 需后续由专门的镜像探测处理，此处不伪装成可探测的普通视频。
pub const VIDEO_EXTENSIONS: &[&str] = &[
    "mkv", "mp4", "m4v", "avi", "mov", "wmv", "flv", "f4v", "webm", "ts", "m2ts", "mts", "vob",
    "mpg", "mpeg", "3gp", "ogv", "divx", "rm", "rmvb", "asf", "mk3d", "m2v",
];

/// 部分内容指纹采样块大小：头 / 中 / 尾各 64 KiB。
pub const FINGERPRINT_CHUNK: u64 = 64 * 1024;

/// 判断一个相对路径是否属于可扫描的视频文件。
pub fn is_video(relative_path: &str) -> bool {
    let ext = Path::new(relative_path)
        .extension()
        .and_then(|e| e.to_str())
        .map(|s| s.to_ascii_lowercase());
    match ext {
        Some(e) => VIDEO_EXTENSIONS.contains(&e.as_str()),
        None => false,
    }
}

// ============================================================
// 内容指纹
// ============================================================

/// （部分）内容指纹：文件大小 + 头/中/尾采样块的 SHA-256。
///
/// 设计：把 `size` 一起喂入哈希，避免「同内容不同截断」碰撞；采样头/中/尾
/// 是为了区分「压制版本不同但文件大小恰好相同」的情况。仅用于去重与变更检测，
/// 不是密码学完整性校验，也不代表媒体内容已被解析。
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct Fingerprint {
    pub size_bytes: u64,
    pub partial_hash: String,
}

impl Fingerprint {
    /// 入库/比较用的稳定字符串键。
    pub fn as_key(&self) -> String {
        format!("{}:{}", self.size_bytes, self.partial_hash)
    }
}

/// 从流式句柄计算部分内容指纹。
///
/// 通过 `Seek` 读取头、中、尾三块（不足三块时按实际长度读取），把每个块的
/// 长度与内容、以及文件总大小一并喂入 SHA-256。不会读满整个大文件。
pub fn compute_fingerprint(reader: &mut dyn MediaReader, size: u64) -> Result<Fingerprint> {
    let mut hasher = Sha256::new();
    hasher.update(size.to_le_bytes());

    if size == 0 {
        let digest = hasher.finalize();
        return Ok(Fingerprint {
            size_bytes: 0,
            partial_hash: hex(digest.as_slice()),
        });
    }

    // 采样偏移：头 0、中 size/2、尾 max(0, size - CHUNK)。
    let mut offsets: Vec<u64> = vec![0, size / 2, size.saturating_sub(FINGERPRINT_CHUNK)];
    offsets.sort_unstable();
    offsets.dedup();

    for offset in offsets {
        let len = std::cmp::min(FINGERPRINT_CHUNK, size - offset) as usize;
        let mut buf = vec![0u8; len];
        reader.seek(SeekFrom::Start(offset))?;
        reader.read_exact(&mut buf[..len])?;
        hasher.update((len as u64).to_le_bytes());
        hasher.update(&buf);
    }

    let digest = hasher.finalize();
    Ok(Fingerprint {
        size_bytes: size,
        partial_hash: hex(digest.as_slice()),
    })
}

fn hex(bytes: &[u8]) -> String {
    let mut s = String::with_capacity(bytes.len() * 2);
    for b in bytes {
        s.push_str(&format!("{:02x}", b));
    }
    s
}

// ============================================================
// MediaProbe 抽象（明确不伪造探测结果）
// ============================================================

/// 媒体探测结论。注意：这里刻意**不**返回 `VideoStreamInfo`，
/// 因为当前没有任何真实探测后端，返回结构体会诱导上层误以为探测成功。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProbeOutcome {
    /// 是否具备真实探测能力。当前恒为 false。
    pub available: bool,
    pub note: String,
}

/// 媒体探测（时长 / 分辨率 / 编码 / HDR）抽象。
///
/// 未来接入 FFmpeg(ffprobe) / libmpv 后可实现本 trait；届时 `available=true`
/// 必须以真实探测结果为依据，未探测到的字段保持缺省，不得填充推测值。
pub trait MediaProbe: Send + Sync {
    fn probe(&self, entry: &DirEntry) -> ProbeOutcome;
}

/// 默认探测实现：如实报告「当前无 FFmpeg 绑定，探测不可用」。
#[derive(Debug, Default, Clone, Copy)]
pub struct NoopMediaProbe;

impl MediaProbe for NoopMediaProbe {
    fn probe(&self, _entry: &DirEntry) -> ProbeOutcome {
        ProbeOutcome {
            available: false,
            note:
                "未绑定 FFmpeg/libmpv 探测后端：时长/分辨率/编码/HDR 均为未知，未伪造任何探测结果"
                    .to_string(),
        }
    }
}

// ============================================================
// 去重
// ============================================================

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum DuplicateVerdict {
    /// 首次见到该指纹。
    New,
    /// 与 `original` 内容指纹相同（可能为副本/硬链）。
    DuplicateOf(String),
}

/// 基于指纹的重复检测器。
#[derive(Debug, Default)]
pub struct DuplicateDetector {
    by_fingerprint: HashMap<String, String>,
}

impl DuplicateDetector {
    pub fn new() -> Self {
        DuplicateDetector {
            by_fingerprint: HashMap::new(),
        }
    }

    pub fn check(&mut self, fingerprint: &Fingerprint, relative_path: &str) -> DuplicateVerdict {
        let key = fingerprint.as_key();
        match self.by_fingerprint.get(&key) {
            Some(original) if original != relative_path => {
                DuplicateVerdict::DuplicateOf(original.clone())
            }
            Some(_) => DuplicateVerdict::New, // 同一路径重复上报不算新增副本
            None => {
                self.by_fingerprint.insert(key, relative_path.to_string());
                DuplicateVerdict::New
            }
        }
    }

    pub fn seen_count(&self) -> usize {
        self.by_fingerprint.len()
    }
}

// ============================================================
// 增量扫描决策
// ============================================================

/// 库中已记录的文件戳。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FileStamp {
    pub size_bytes: u64,
    pub modified_at: Option<String>,
    /// 上次的 [`Fingerprint::as_key`] 值；旧记录可能缺失。
    pub fingerprint: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ScanDecision {
    /// 内容未变，跳过。
    Skip,
    /// 内容或元数据变化，需要重新入库/刮削。
    Rescan,
    /// 库中不存在，新增。
    New,
}

/// 依据 `size + mtime + fingerprint` 决定是否重新处理。
///
/// - size 不同 → 内容必变，重扫。
/// - mtime 变化但部分指纹一致 → 视为「仅时间戳抖动」，跳过（避免重复刮削）。
/// - 指纹不同或缺失 → 重扫。
pub fn decide(
    existing: Option<&FileStamp>,
    current_size: u64,
    current_mtime: &Option<String>,
    current_fingerprint: &Fingerprint,
) -> ScanDecision {
    let Some(stamp) = existing else {
        return ScanDecision::New;
    };
    if stamp.size_bytes != current_size {
        return ScanDecision::Rescan;
    }
    let current_key = current_fingerprint.as_key();
    let fp_matches = stamp.fingerprint.as_deref() == Some(current_key.as_str());
    if stamp.modified_at != *current_mtime {
        return if fp_matches {
            ScanDecision::Skip
        } else {
            ScanDecision::Rescan
        };
    }
    if !fp_matches {
        return ScanDecision::Rescan;
    }
    ScanDecision::Skip
}

// ============================================================
// 删除/移动检测
// ============================================================

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct KnownFile {
    pub relative_path: String,
    pub fingerprint: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct ReconcileOutcome {
    pub removed: Vec<String>,
    /// (旧路径, 新路径)
    pub moved: Vec<(String, String)>,
}

/// 把「库中已知文件」与「本次扫描发现的文件」对齐：
/// - 库中路径仍在 → 保留。
/// - 库中路径消失，但存在相同指纹的新路径 → 判定为移动/重命名。
/// - 库中路径消失且无相同指纹 → 判定为删除。
pub fn reconcile(known: &[KnownFile], discovered: &[(String, String)]) -> ReconcileOutcome {
    let discovered_paths: HashSet<&str> = discovered.iter().map(|(p, _)| p.as_str()).collect();
    let mut by_fp: HashMap<&str, Vec<&str>> = HashMap::new();
    for (path, fp) in discovered {
        by_fp.entry(fp.as_str()).or_default().push(path.as_str());
    }

    let mut outcome = ReconcileOutcome::default();
    // 已被判定为「移动目的地」的新路径，避免多对一重复认领。
    let mut claimed: HashSet<String> = HashSet::new();
    for k in known {
        if discovered_paths.contains(k.relative_path.as_str()) {
            continue;
        }
        let mut moved_to: Option<String> = None;
        if let Some(paths) = by_fp.get(k.fingerprint.as_str()) {
            for path in paths {
                // path: &&str，*path: &str
                if !claimed.contains(*path) {
                    claimed.insert((*path).to_string());
                    moved_to = Some((*path).to_string());
                    break;
                }
            }
        }
        if let Some(to) = moved_to {
            outcome.moved.push((k.relative_path.clone(), to));
        } else {
            outcome.removed.push(k.relative_path.clone());
        }
    }
    outcome
}

// ============================================================
// 断点恢复游标
// ============================================================

/// 断点恢复游标，序列化进 `MediaSource.scanCursor`。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ScanCursor {
    /// 上次已处理完成的最后一个相对路径（字典序）。
    pub last_relative_path: String,
    pub scanned: i64,
}

impl ScanCursor {
    pub fn encode(&self) -> Result<String> {
        Ok(serde_json::to_string(self)?)
    }
    pub fn decode(raw: &str) -> Result<Self> {
        Ok(serde_json::from_str(raw)?)
    }
}

// ============================================================
// 取消令牌
// ============================================================

/// 可共享的取消令牌（基于 `Arc<AtomicBool>`，无需外部 runtime）。
#[derive(Clone, Default)]
pub struct CancelToken {
    flag: Arc<AtomicBool>,
}

impl CancelToken {
    pub fn new() -> Self {
        CancelToken {
            flag: Arc::new(AtomicBool::new(false)),
        }
    }
    pub fn cancel(&self) {
        self.flag.store(true, Ordering::SeqCst);
    }
    pub fn is_cancelled(&self) -> bool {
        self.flag.load(Ordering::SeqCst)
    }
    pub fn reset(&self) {
        self.flag.store(false, Ordering::SeqCst);
    }
}

// ============================================================
// 扫描事件
// ============================================================

/// 扫描进度/结果事件流，供 Tauri 侧转成前端事件。
#[derive(Debug, Clone, PartialEq)]
pub enum ScanEvent {
    Progress(ScanProgress),
    FileDiscovered {
        relative_path: String,
        fingerprint: Fingerprint,
    },
    Duplicate {
        relative_path: String,
        original: String,
    },
    Removed {
        relative_path: String,
    },
    Moved {
        from: String,
        to: String,
    },
    Cancelled,
    Finished(ScanProgress),
}

/// 单个被发现文件的扫描结果。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ScannedFile {
    pub relative_path: String,
    pub fingerprint: String,
    pub size_bytes: u64,
    pub modified_at: Option<String>,
}

// ============================================================
// 扫描器
// ============================================================

pub struct Scanner {
    cancel: CancelToken,
}

impl Scanner {
    pub fn new(cancel: CancelToken) -> Self {
        Scanner { cancel }
    }

    pub fn cancel_token(&self) -> CancelToken {
        self.cancel.clone()
    }

    /// 执行一次扫描。
    ///
    /// - `existing`：库中已有的文件戳（path -> FileStamp），用于增量与删除检测。
    /// - `cursor`：断点恢复游标；为 `None` 时全量扫描。
    /// - `sink`：事件回调（进度、发现、重复、删除、移动、取消、完成）。
    pub fn scan(
        &self,
        provider: &dyn MediaProvider,
        source_id: &str,
        existing: &HashMap<String, FileStamp>,
        cursor: Option<&ScanCursor>,
        sink: &mut dyn FnMut(ScanEvent),
    ) -> Result<ScanProgress> {
        let mut ctx = ScanContext {
            provider,
            cancel: self.cancel.clone(),
            cursor_last: cursor.map(|c| c.last_relative_path.clone()),
            existing,
            detector: DuplicateDetector::new(),
            progress: ScanProgress {
                source_id: source_id.to_string(),
                state: ScanState::Scanning,
                scanned: 0,
                discovered: 0,
                duplicates: 0,
                removed: 0,
                current_path: None,
                started_at: Some(chrono::Utc::now().to_rfc3339()),
                cancellable: true,
            },
            discovered: Vec::new(),
            sink,
            cancelled: false,
        };

        ctx.walk("")?;

        // 删除/移动对齐。
        let known: Vec<KnownFile> = existing
            .iter()
            .filter_map(|(path, stamp)| {
                stamp.fingerprint.as_ref().map(|f| KnownFile {
                    relative_path: path.clone(),
                    fingerprint: f.clone(),
                })
            })
            .collect();
        let outcome = reconcile(&known, &ctx.discovered);
        for path in outcome.removed {
            ctx.progress.removed += 1;
            ctx.emit(ScanEvent::Removed {
                relative_path: path,
            });
        }
        for (from, to) in outcome.moved {
            ctx.emit(ScanEvent::Moved { from, to });
        }

        ctx.progress.current_path = None;
        if ctx.cancelled {
            // 保留游标可续扫，用 Paused 表达「中断但可恢复」。
            ctx.progress.state = ScanState::Paused;
            ctx.emit(ScanEvent::Cancelled);
        } else {
            ctx.progress.state = ScanState::Idle;
        }
        let final_progress = ctx.progress.clone();
        ctx.emit(ScanEvent::Finished(final_progress.clone()));
        Ok(final_progress)
    }
}

struct ScanContext<'a> {
    provider: &'a dyn MediaProvider,
    cancel: CancelToken,
    cursor_last: Option<String>,
    existing: &'a HashMap<String, FileStamp>,
    detector: DuplicateDetector,
    progress: ScanProgress,
    /// (relative_path, fingerprint_key)
    discovered: Vec<(String, String)>,
    sink: &'a mut dyn FnMut(ScanEvent),
    cancelled: bool,
}

impl ScanContext<'_> {
    fn emit(&mut self, event: ScanEvent) {
        // 显式对 trait object 做可变重借用，避免字段为 &mut dyn FnMut 时的借用歧义。
        (&mut *self.sink)(event);
    }

    fn walk(&mut self, dir: &str) -> Result<()> {
        if self.cancel.is_cancelled() {
            self.cancelled = true;
            return Ok(());
        }
        let entries = self.provider.list(dir)?;
        for entry in entries {
            if self.cancel.is_cancelled() {
                self.cancelled = true;
                return Ok(());
            }
            if entry.is_dir {
                self.walk(&entry.relative_path)?;
                if self.cancelled {
                    return Ok(());
                }
            } else if is_video(&entry.relative_path) {
                // 断点恢复：跳过已处理过的文件路径（字典序 <= 游标）。
                if let Some(last) = &self.cursor_last {
                    if entry.relative_path.as_str() <= last.as_str() {
                        continue;
                    }
                }
                self.visit_file(&entry)?;
            }
        }
        Ok(())
    }

    fn visit_file(&mut self, entry: &DirEntry) -> Result<()> {
        self.progress.current_path = Some(entry.relative_path.clone());
        self.progress.scanned += 1;

        // 部分内容指纹：打开流式句柄读取头/中/尾片段。
        let mut reader = self.provider.open_reader(&entry.relative_path)?;
        let fingerprint = compute_fingerprint(reader.as_mut(), entry.size_bytes)?;

        // 去重。
        if let DuplicateVerdict::DuplicateOf(original) =
            self.detector.check(&fingerprint, &entry.relative_path)
        {
            self.progress.duplicates += 1;
            self.emit(ScanEvent::Duplicate {
                relative_path: entry.relative_path.clone(),
                original,
            });
        }

        // 增量决策。
        let decision = decide(
            self.existing.get(&entry.relative_path),
            entry.size_bytes,
            &entry.modified_at,
            &fingerprint,
        );
        if decision != ScanDecision::Skip {
            self.progress.discovered += 1;
            self.emit(ScanEvent::FileDiscovered {
                relative_path: entry.relative_path.clone(),
                fingerprint: fingerprint.clone(),
            });
        }

        self.discovered
            .push((entry.relative_path.clone(), fingerprint.as_key()));
        let snapshot = self.progress.clone();
        self.emit(ScanEvent::Progress(snapshot));
        Ok(())
    }
}

// ============================================================
// 单元测试（纯逻辑，可编译）
// ============================================================

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Cursor, Read, Seek};

    /// 用内存 Cursor 充当 MediaReader，便于纯逻辑测试指纹。
    struct MemReader(Cursor<Vec<u8>>);
    impl Read for MemReader {
        fn read(&mut self, buf: &mut [u8]) -> std::io::Result<usize> {
            self.0.read(buf)
        }
    }
    impl Seek for MemReader {
        fn seek(&mut self, pos: SeekFrom) -> std::io::Result<u64> {
            self.0.seek(pos)
        }
    }

    #[test]
    fn video_extension_recognition() {
        assert!(is_video("Movies/Inception.2010.mkv"));
        assert!(is_video("Movies/Clip.MP4"));
        assert!(is_video("Series/S01E01.m2ts"));
        assert!(!is_video("Movies/poster.jpg"));
        assert!(!is_video("Movies/README"));
        assert!(!is_video("Movies/no_extension"));
    }

    #[test]
    fn fingerprint_is_stable_and_size_sensitive() {
        let data = b"0123456789abcdef".repeat(4096); // 64 KiB
        let mut r1 = MemReader(Cursor::new(data.clone()));
        let mut r2 = MemReader(Cursor::new(data.clone()));
        let f1 = compute_fingerprint(&mut r1, data.len() as u64).unwrap();
        let f2 = compute_fingerprint(&mut r2, data.len() as u64).unwrap();
        assert_eq!(f1, f2, "相同内容必须得到相同指纹");
        assert_eq!(f1.size_bytes, data.len() as u64);

        // 大小参与哈希：即使内容相同字节、声明大小不同，指纹也应不同。
        let mut r3 = MemReader(Cursor::new(data.clone()));
        let f3 = compute_fingerprint(&mut r3, (data.len() as u64) + 1).unwrap();
        assert_ne!(f1.as_key(), f3.as_key());
    }

    #[test]
    fn fingerprint_detects_tail_change() {
        let mut data = b"A".repeat(200 * 1024);
        let mut r1 = MemReader(Cursor::new(data.clone()));
        let f1 = compute_fingerprint(&mut r1, data.len() as u64).unwrap();

        // 只改尾部内容，头/中不变，尾采样必须让指纹变化。
        let last = data.len() - 1;
        data[last] = b'B';
        let mut r2 = MemReader(Cursor::new(data.clone()));
        let f2 = compute_fingerprint(&mut r2, data.len() as u64).unwrap();
        assert_ne!(f1.as_key(), f2.as_key());
    }

    #[test]
    fn duplicate_detector_reports_original_path() {
        let mut d = DuplicateDetector::new();
        let f = Fingerprint {
            size_bytes: 100,
            partial_hash: "abc".to_string(),
        };
        assert_eq!(d.check(&f, "a.mkv"), DuplicateVerdict::New);
        assert_eq!(
            d.check(&f, "b.mkv"),
            DuplicateVerdict::DuplicateOf("a.mkv".to_string())
        );
        assert_eq!(d.seen_count(), 1);
        // 同路径重复上报不算副本。
        assert_eq!(d.check(&f, "a.mkv"), DuplicateVerdict::New);
    }

    #[test]
    fn incremental_decision_uses_size_mtime_fingerprint() {
        let fp = Fingerprint {
            size_bytes: 1000,
            partial_hash: "hash".to_string(),
        };
        let key = fp.as_key();
        let stamp = FileStamp {
            size_bytes: 1000,
            modified_at: Some("2024-01-01T00:00:00+00:00".to_string()),
            fingerprint: Some(key.clone()),
        };
        // 完全一致 → Skip
        assert_eq!(
            decide(Some(&stamp), 1000, &stamp.modified_at, &fp),
            ScanDecision::Skip
        );
        // 新文件 → New
        assert_eq!(
            decide(None, 1000, &stamp.modified_at, &fp),
            ScanDecision::New
        );
        // size 变化 → Rescan
        assert_eq!(
            decide(Some(&stamp), 1001, &stamp.modified_at, &fp),
            ScanDecision::Rescan
        );
        // 仅 mtime 抖动但指纹一致 → Skip（不重复刮削）
        let bumped = Some("2024-06-01T00:00:00+00:00".to_string());
        assert_eq!(decide(Some(&stamp), 1000, &bumped, &fp), ScanDecision::Skip);
        // mtime 变化且指纹不同 → Rescan
        let other = Fingerprint {
            size_bytes: 1000,
            partial_hash: "other".to_string(),
        };
        assert_eq!(
            decide(Some(&stamp), 1000, &bumped, &other),
            ScanDecision::Rescan
        );
        // 旧记录缺指纹 → Rescan（补算）
        let legacy = FileStamp {
            size_bytes: 1000,
            modified_at: stamp.modified_at.clone(),
            fingerprint: None,
        };
        assert_eq!(
            decide(Some(&legacy), 1000, &stamp.modified_at, &fp),
            ScanDecision::Rescan
        );
    }

    #[test]
    fn reconcile_detects_remove_and_move() {
        let known = vec![
            KnownFile {
                relative_path: "Old/a.mkv".to_string(),
                fingerprint: "fp1".to_string(),
            },
            KnownFile {
                relative_path: "Lost/b.mkv".to_string(),
                fingerprint: "fp2".to_string(),
            },
        ];
        let discovered = vec![
            ("New/a.mkv".to_string(), "fp1".to_string()), // a 被移动/重命名
            ("Other/c.mkv".to_string(), "fp3".to_string()), // 新增
        ];
        let outcome = reconcile(&known, &discovered);
        assert_eq!(outcome.removed, vec!["Lost/b.mkv".to_string()]);
        assert_eq!(
            outcome.moved,
            vec![("Old/a.mkv".to_string(), "New/a.mkv".to_string())]
        );
    }

    #[test]
    fn scan_cursor_roundtrip() {
        let c = ScanCursor {
            last_relative_path: "Movies/z.mkv".to_string(),
            scanned: 42,
        };
        let raw = c.encode().unwrap();
        assert_eq!(ScanCursor::decode(&raw).unwrap(), c);
    }

    #[test]
    fn cancel_token_toggles() {
        let t = CancelToken::new();
        assert!(!t.is_cancelled());
        let clone = t.clone();
        clone.cancel();
        assert!(t.is_cancelled());
        t.reset();
        assert!(!t.is_cancelled());
    }

    #[test]
    fn noop_probe_never_fakes_capability() {
        let outcome = NoopMediaProbe.probe(&DirEntry {
            name: "a.mkv".to_string(),
            relative_path: "a.mkv".to_string(),
            is_dir: false,
            size_bytes: 123,
            modified_at: None,
        });
        assert!(!outcome.available);
        assert!(outcome.note.contains("未伪造"));
    }
}
