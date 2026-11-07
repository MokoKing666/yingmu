//! artwork — LRU 磁盘封面缓存（多尺寸档位、淘汰、重建、预加载）
//!
//! - 索引存放在 `artwork_cache` 表（见 database 模块），真实字节写在缓存目录，
//!   目录由平台层解析为 `%LOCALAPPDATA%\YingMu\Cache\Artwork`，绝不写安装目录。
//! - LRU 依据 `last_access_at`：每次 `get` 刷新访问时间；超容量时按最久未访问淘汰。
//! - 图片字节通过 [`ArtworkLoader`] 注入（在线下载 / 本地生成由平台层实现）；
//!   默认 [`NoopArtworkLoader`] 返回明确的「未验证」错误，绝不伪造图片数据。
//!
//! 本模块源码未经编译验证：本地已具备 Rust 与便携 MSVC/Windows SDK 工具链，但受构建环境限制尚未完成完整编译与测试；不得视为可运行实现。

use crate::database::{ArtworkEntry, Database};
use crate::models::{ArtworkKind, ArtworkRequest, ArtworkSize};
use crate::{CoreError, Result};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};

/// 默认缓存上限：256 MiB。
pub const DEFAULT_MAX_BYTES: i64 = 256 * 1024 * 1024;

pub fn artwork_kind_str(kind: ArtworkKind) -> &'static str {
    match kind {
        ArtworkKind::Poster => "poster",
        ArtworkKind::Backdrop => "backdrop",
        ArtworkKind::Thumbnail => "thumbnail",
    }
}

pub fn artwork_size_str(size: ArtworkSize) -> &'static str {
    match size {
        ArtworkSize::Sm => "sm",
        ArtworkSize::Md => "md",
        ArtworkSize::Lg => "lg",
        ArtworkSize::Xl => "xl",
    }
}

/// 一次缓存命中/写入的结果。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CachedArtwork {
    /// 缓存文件的平台相关路径（供 `artworkGet` 返回给前端）。
    pub path: String,
    pub bytes: i64,
    /// 是否为缓存命中（put 返回 false）。
    pub hit: bool,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct RebuildReport {
    pub indexed_before: usize,
    pub missing_removed: usize,
    pub indexed_after: usize,
    pub total_bytes: i64,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct PreloadReport {
    pub requested: usize,
    pub loaded: usize,
    pub skipped: usize,
    pub failed: usize,
}

/// 封面字节加载注入点（平台层用真实 HTTP / 本地图片生成实现）。
pub trait ArtworkLoader: Send + Sync {
    fn load(&self, request: &ArtworkRequest) -> Result<Vec<u8>>;
}

/// 默认加载器：明确报告「加载器未注入」，绝不返回伪造的图片字节。
#[derive(Debug, Default, Clone, Copy)]
pub struct NoopArtworkLoader;

impl ArtworkLoader for NoopArtworkLoader {
    fn load(&self, _request: &ArtworkRequest) -> Result<Vec<u8>> {
        Err(CoreError::Unvalidated(
            "封面加载器未注入：需由平台层提供在线下载/本地生成实现后方可预加载".to_string(),
        ))
    }
}

pub struct ArtworkCache {
    root: PathBuf,
    max_bytes: i64,
    /// 单调逻辑时钟：LRU 时间戳用它生成零填充字符串，确保排序严格确定，
    /// 避免多条记录落在同一毫秒时淘汰顺序不确定。
    clock: AtomicU64,
}

impl ArtworkCache {
    pub fn new(root: impl Into<PathBuf>, max_bytes: i64) -> Self {
        ArtworkCache {
            root: root.into(),
            max_bytes: max_bytes.max(0),
            clock: AtomicU64::new(0),
        }
    }

    fn next_stamp(&self) -> String {
        format!("{:020}", self.clock.fetch_add(1, Ordering::SeqCst))
    }

    pub fn with_defaults(root: impl Into<PathBuf>) -> Self {
        ArtworkCache::new(root, DEFAULT_MAX_BYTES)
    }

    pub fn root(&self) -> &Path {
        &self.root
    }

    pub fn max_bytes(&self) -> i64 {
        self.max_bytes
    }

    /// 稳定的缓存路径：`root/<id前2位>/<mediaId>/<kind>_<size>.img`。
    /// mediaId 为 UUID，做文件名安全；不同档位落在不同文件，便于按档淘汰/预加载。
    pub fn path_for(&self, media_id: &str, kind: ArtworkKind, size: ArtworkSize) -> PathBuf {
        // 按字符而非字节取前缀，避免非 ASCII media_id 切在 UTF-8 中间导致 panic。
        let prefix: String = media_id.chars().take(2).collect();
        self.root.join(prefix).join(media_id).join(format!(
            "{}_{}.img",
            artwork_kind_str(kind),
            artwork_size_str(size)
        ))
    }

    /// 读取缓存并刷新 LRU 访问时间。索引存在但文件已丢失时删除索引并返回 None
    /// （缓存失效，需重建/重新加载），绝不返回指向不存在文件的路径。
    pub fn get(&self, db: &Database, request: &ArtworkRequest) -> Result<Option<CachedArtwork>> {
        let kind = artwork_kind_str(request.kind);
        let size = artwork_size_str(request.size);
        match db.artwork_get(&request.media_id, kind, size)? {
            None => Ok(None),
            Some(entry) => {
                if !Path::new(&entry.path).exists() {
                    db.artwork_remove(&request.media_id, kind, size)?;
                    return Ok(None);
                }
                // 用单调逻辑时钟刷新 LRU 时间（覆盖 artwork_get 的墙钟写入）。
                let path = entry.path.clone();
                let bytes = entry.bytes;
                let touched = ArtworkEntry {
                    last_access_at: self.next_stamp(),
                    ..entry
                };
                db.artwork_upsert(&touched)?;
                Ok(Some(CachedArtwork {
                    path,
                    bytes,
                    hit: true,
                }))
            }
        }
    }

    /// 写入缓存字节，登记索引，并触发 LRU 淘汰。
    pub fn put(
        &self,
        db: &Database,
        request: &ArtworkRequest,
        bytes: &[u8],
    ) -> Result<CachedArtwork> {
        let path = self.path_for(&request.media_id, request.kind, request.size);
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        std::fs::write(&path, bytes)?;
        let path_string = path.to_string_lossy().into_owned();
        let entry = ArtworkEntry {
            media_id: request.media_id.clone(),
            kind: artwork_kind_str(request.kind).to_string(),
            size: artwork_size_str(request.size).to_string(),
            path: path_string.clone(),
            bytes: bytes.len() as i64,
            last_access_at: self.next_stamp(),
        };
        db.artwork_upsert(&entry)?;
        self.evict_if_needed(db)?;
        Ok(CachedArtwork {
            path: path_string,
            bytes: entry.bytes,
            hit: false,
        })
    }

    /// LRU 淘汰：总字节超过 `max_bytes` 时，按 `last_access_at` 升序（最久未访问）
    /// 删除文件与索引，直到总量回落到上限内。
    pub fn evict_if_needed(&self, db: &Database) -> Result<usize> {
        let mut total = db.artwork_total_bytes()?;
        if total <= self.max_bytes {
            return Ok(0);
        }
        let entries = db.artwork_all()?; // 已按 last_access_at ASC
        let mut evicted = 0usize;
        for entry in entries {
            if total <= self.max_bytes {
                break;
            }
            let _ = std::fs::remove_file(&entry.path);
            db.artwork_remove(&entry.media_id, &entry.kind, &entry.size)?;
            total -= entry.bytes;
            evicted += 1;
        }
        Ok(evicted)
    }

    /// 重建索引：清除「索引在但文件已丢失」的陈旧记录。
    /// 不删除仍有效的缓存，也不擅自生成不存在的封面。
    pub fn rebuild(&self, db: &Database) -> Result<RebuildReport> {
        let entries = db.artwork_all()?;
        let mut missing = 0usize;
        for entry in &entries {
            if !Path::new(&entry.path).exists() {
                db.artwork_remove(&entry.media_id, &entry.kind, &entry.size)?;
                missing += 1;
            }
        }
        let remaining = db.artwork_all()?;
        Ok(RebuildReport {
            indexed_before: entries.len(),
            missing_removed: missing,
            indexed_after: remaining.len(),
            total_bytes: db.artwork_total_bytes()?,
        })
    }

    /// 预加载：命中跳过，未命中调用注入的 loader；loader 失败计入 failed，
    /// 不抛假成功、不中断其余请求。
    pub fn preload(
        &self,
        db: &Database,
        requests: &[ArtworkRequest],
        loader: &dyn ArtworkLoader,
    ) -> Result<PreloadReport> {
        let mut report = PreloadReport::default();
        for request in requests {
            report.requested += 1;
            if self.get(db, request)?.is_some() {
                report.skipped += 1;
                continue;
            }
            match loader.load(request) {
                Ok(bytes) => {
                    self.put(db, request, &bytes)?;
                    report.loaded += 1;
                }
                Err(_) => report.failed += 1,
            }
        }
        Ok(report)
    }
}

// ============================================================
// 单元测试（临时目录 + 内存数据库，可编译）
// ============================================================

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_root() -> PathBuf {
        std::env::temp_dir().join(format!(
            "yingmu-artwork-test-{}-{}",
            std::process::id(),
            chrono::Utc::now().timestamp_millis()
        ))
    }

    fn request(media_id: &str, kind: ArtworkKind, size: ArtworkSize) -> ArtworkRequest {
        ArtworkRequest {
            media_id: media_id.to_string(),
            kind,
            size,
        }
    }

    /// 固定字节的测试加载器（不访问网络）。
    struct FixedLoader(Vec<u8>);
    impl ArtworkLoader for FixedLoader {
        fn load(&self, _r: &ArtworkRequest) -> Result<Vec<u8>> {
            Ok(self.0.clone())
        }
    }

    #[test]
    fn kind_and_size_strings() {
        assert_eq!(artwork_kind_str(ArtworkKind::Poster), "poster");
        assert_eq!(artwork_kind_str(ArtworkKind::Backdrop), "backdrop");
        assert_eq!(artwork_kind_str(ArtworkKind::Thumbnail), "thumbnail");
        assert_eq!(artwork_size_str(ArtworkSize::Sm), "sm");
        assert_eq!(artwork_size_str(ArtworkSize::Xl), "xl");
    }

    #[test]
    fn path_for_is_stable_and_per_size() {
        let cache = ArtworkCache::with_defaults(Path::new("Cache/Artwork"));
        let a = cache.path_for("abcdef-id", ArtworkKind::Poster, ArtworkSize::Lg);
        let b = cache.path_for("abcdef-id", ArtworkKind::Poster, ArtworkSize::Lg);
        let c = cache.path_for("abcdef-id", ArtworkKind::Poster, ArtworkSize::Sm);
        assert_eq!(a, b);
        assert_ne!(a, c, "不同尺寸档位必须使用不同缓存文件");
        assert!(a.to_string_lossy().contains("poster_lg.img"));
        assert!(a.to_string_lossy().contains("ab"));
    }

    #[test]
    fn put_get_hit_and_missing_file_invalidates_index() {
        let root = temp_root();
        let db = Database::open_in_memory().unwrap();
        let cache = ArtworkCache::new(root.clone(), 10_000);
        let req = request("m1", ArtworkKind::Poster, ArtworkSize::Md);

        assert!(cache.get(&db, &req).unwrap().is_none());
        let written = cache.put(&db, &req, b"png-bytes").unwrap();
        assert!(!written.hit);
        assert_eq!(written.bytes, 9);

        let hit = cache.get(&db, &req).unwrap().unwrap();
        assert!(hit.hit);
        assert_eq!(hit.path, written.path);
        assert!(Path::new(&hit.path).exists());

        // 文件被外部删除后，索引失效，返回 None 且记录被清除。
        std::fs::remove_file(&written.path).unwrap();
        assert!(cache.get(&db, &req).unwrap().is_none());
        assert!(db.artwork_get("m1", "poster", "md").unwrap().is_none());
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn eviction_removes_least_recently_used() {
        let root = temp_root();
        let db = Database::open_in_memory().unwrap();
        // 上限 12 字节：3 个 5 字节条目会超量。
        let cache = ArtworkCache::new(root.clone(), 12);
        let r1 = request("m1", ArtworkKind::Poster, ArtworkSize::Sm);
        let r2 = request("m2", ArtworkKind::Poster, ArtworkSize::Sm);
        let r3 = request("m3", ArtworkKind::Poster, ArtworkSize::Sm);
        cache.put(&db, &r1, b"11111").unwrap();
        cache.put(&db, &r2, b"22222").unwrap();
        // 访问 r1 刷新其 LRU 时间，使 r2 成为最久未访问。
        assert!(cache.get(&db, &r1).unwrap().is_some());
        cache.put(&db, &r3, b"33333").unwrap();

        assert!(db.artwork_total_bytes().unwrap() <= 12);
        // r2 应被淘汰，r1（刚访问过）与 r3（最新）仍在。
        assert!(cache.get(&db, &r2).unwrap().is_none());
        assert!(cache.get(&db, &r1).unwrap().is_some());
        assert!(cache.get(&db, &r3).unwrap().is_some());
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn rebuild_drops_stale_index_entries() {
        let root = temp_root();
        let db = Database::open_in_memory().unwrap();
        let cache = ArtworkCache::new(root.clone(), 10_000);
        let r1 = request("m1", ArtworkKind::Backdrop, ArtworkSize::Lg);
        let r2 = request("m2", ArtworkKind::Backdrop, ArtworkSize::Lg);
        let p1 = cache.put(&db, &r1, b"aaaa").unwrap();
        cache.put(&db, &r2, b"bbbb").unwrap();
        std::fs::remove_file(&p1.path).unwrap();

        let report = cache.rebuild(&db).unwrap();
        assert_eq!(report.indexed_before, 2);
        assert_eq!(report.missing_removed, 1);
        assert_eq!(report.indexed_after, 1);
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn preload_never_fakes_success_without_loader() {
        let root = temp_root();
        let db = Database::open_in_memory().unwrap();
        let cache = ArtworkCache::new(root.clone(), 10_000);
        let requests = vec![
            request("m1", ArtworkKind::Poster, ArtworkSize::Sm),
            request("m2", ArtworkKind::Poster, ArtworkSize::Sm),
        ];
        let report = cache.preload(&db, &requests, &NoopArtworkLoader).unwrap();
        assert_eq!(report.requested, 2);
        assert_eq!(report.failed, 2, "未注入加载器时必须如实记为失败");
        assert_eq!(report.loaded, 0);
        assert_eq!(db.artwork_all().unwrap().len(), 0);
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn preload_uses_injected_loader_and_skips_hits() {
        let root = temp_root();
        let db = Database::open_in_memory().unwrap();
        let cache = ArtworkCache::new(root.clone(), 10_000);
        let requests = vec![
            request("m1", ArtworkKind::Poster, ArtworkSize::Sm),
            request("m2", ArtworkKind::Poster, ArtworkSize::Sm),
        ];
        let first = cache
            .preload(&db, &requests, &FixedLoader(b"img".to_vec()))
            .unwrap();
        assert_eq!(first.loaded, 2);
        let second = cache
            .preload(&db, &requests, &FixedLoader(b"img".to_vec()))
            .unwrap();
        assert_eq!(second.skipped, 2, "已缓存的应跳过加载");
        assert_eq!(second.loaded, 0);
        let _ = std::fs::remove_dir_all(&root);
    }
}
