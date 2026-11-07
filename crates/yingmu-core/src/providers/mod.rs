//! providers — 媒体源统一抽象（Local / UNC / SMB / WebDAV）
//!
//! # 凭据安全约定（强制）
//! 本模块任何结构体**不得保存明文密码**。所有凭据通过 [`CredentialRef`] 仅保存
//! 「去哪里取」（键名 / 环境变量名），在需要时由 [`CredentialResolver`] 从安全存储
//! 注入。[`Secret`] 的 `Debug` 实现强制脱敏，即使被日志打印也不会泄露。
//! `MediaSource.uri` 永远不含 `user:password@` 形式的凭据。
//!
//! # 实现状态
//! - [`LocalProvider`]：已实现（本地磁盘 + Windows UNC 路径统一抽象）。UNC 的认证由
//!   Windows 会话 / SMB 集成认证在 OS 层完成，本结构体不接触凭据。
//! - [`SmbProvider`] / [`WebDavProvider`]：**骨架，明确标注未验证**。协议客户端尚未
//!   接入，`list/read/stat/open_reader` 一律返回明确错误，绝不伪造成功。
//!
//! 本模块源码未经编译验证：Rust 工具链 1.99.1 已安装（未在 PATH），但 MSVC / Windows SDK / link.exe 缺失；不得视为可运行实现。

use crate::models::SourceProtocol;
use crate::network::Connectivity;
use crate::{CoreError, Result};
use std::collections::HashMap;
use std::fmt;
use std::fs::{self, File};
use std::io::{Read, Seek};
use std::path::{Component, Path, PathBuf};
use std::sync::Arc;
use std::time::SystemTime;

// ============================================================
// 基础数据类型
// ============================================================

/// 单个目录项（与具体协议无关）。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DirEntry {
    pub name: String,
    /// 相对媒体源根的路径，统一使用 `/` 分隔，便于入库与跨平台比较。
    pub relative_path: String,
    pub is_dir: bool,
    pub size_bytes: u64,
    /// ISO 8601；不支持时间属性的协议返回 None。
    pub modified_at: Option<String>,
}

/// 文件/目录元数据。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Stat {
    pub is_dir: bool,
    pub size_bytes: u64,
    pub modified_at: Option<String>,
}

/// 只读媒体流抽象；`open_reader` 用于指纹计算（需要 `Seek` 读取头/中/尾片段）。
pub trait MediaReader: Read + Seek + Send {}

impl<T: Read + Seek + Send> MediaReader for T {}

/// 把 `SystemTime` 转成 ISO 8601（UTC, RFC 3339）。
fn system_time_to_iso(t: SystemTime) -> Option<String> {
    let dt: chrono::DateTime<chrono::Utc> = chrono::DateTime::from(t);
    Some(dt.to_rfc3339())
}

/// 用 `/` 拼接相对路径（不依赖平台分隔符）。
pub fn join_relative(base: &str, name: &str) -> String {
    let trimmed = base.trim_matches('/');
    if trimmed.is_empty() {
        name.to_string()
    } else {
        format!("{}/{}", trimmed, name)
    }
}

/// 判断一个根字符串是否为 Windows UNC 路径（`\\server\share` 或 `//server/share`）。
pub fn is_unc_root(root: &str) -> bool {
    root.starts_with(r"\\") || root.starts_with("//")
}

/// 安全地拼接根路径与相对路径：拒绝绝对路径与 `..`，防止目录穿越。
pub fn safe_join(root: &Path, relative: &str) -> Result<PathBuf> {
    let rel = Path::new(relative);
    if rel.is_absolute() {
        return Err(CoreError::InvalidPath(format!(
            "相对路径不得为绝对路径: {}",
            relative
        )));
    }
    for component in rel.components() {
        if matches!(component, Component::ParentDir) {
            return Err(CoreError::InvalidPath(format!(
                "相对路径不得包含父目录回退: {}",
                relative
            )));
        }
    }
    Ok(root.join(rel))
}

// ============================================================
// 凭据：只保存引用，不保存明文
// ============================================================

/// 凭据引用：仅描述「凭据在哪里」，不含凭据本体。
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CredentialRef {
    /// 该源无需凭据（本地磁盘 / 匿名 UNC）。
    None,
    /// 从系统安全存储（如 Windows Credential Manager）的指定键读取。
    Keyring { service: String, account: String },
    /// 从指定环境变量读取（变量名，不含值）。
    Env { variable: String },
}

/// 凭据值的包装器，`Debug` 恒脱敏。
#[derive(Clone, PartialEq, Eq)]
pub struct Secret(String);

impl Secret {
    pub fn new(value: impl Into<String>) -> Self {
        Secret(value.into())
    }
    /// 仅在真正发起协议调用时才取出明文，调用方负责不记录它。
    pub fn expose(&self) -> &str {
        &self.0
    }
}

impl fmt::Debug for Secret {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str("Secret(***)")
    }
}

/// 凭据解析器：把「引用」解析为一次性使用的明文值。
pub trait CredentialResolver: Send + Sync {
    fn resolve(&self, reference: &CredentialRef) -> Result<Option<Secret>>;
}

/// 基于进程环境变量的解析器（用于 TMDB / WebDAV 等从环境注入的场景）。
pub struct EnvCredentialResolver;

impl CredentialResolver for EnvCredentialResolver {
    fn resolve(&self, reference: &CredentialRef) -> Result<Option<Secret>> {
        match reference {
            CredentialRef::None => Ok(None),
            CredentialRef::Env { variable } => match std::env::var(variable) {
                Ok(v) if !v.is_empty() => Ok(Some(Secret::new(v))),
                _ => Err(CoreError::CredentialMissing(format!(
                    "环境变量 {} 未设置或为空",
                    variable
                ))),
            },
            CredentialRef::Keyring { service, account } => {
                Err(CoreError::CredentialMissing(format!(
                    "键环凭据 {}/{} 需由平台层安全存储解析器提供，EnvCredentialResolver 不支持",
                    service, account
                )))
            }
        }
    }
}

// ============================================================
// MediaProvider trait
// ============================================================

/// 所有媒体源的最小公共能力集。
///
/// 新增协议（NFS / FTP / SFTP / Jellyfin / Emby / Plex）只需实现本 trait 并注册到
/// [`ProviderRegistry`]，扫描器与上层命令无需改动。
pub trait MediaProvider: Send + Sync {
    /// 稳定的源 ID。
    fn id(&self) -> &str;
    fn protocol(&self) -> SourceProtocol;
    /// 该实现是否已经过本机实机验证。
    fn validated(&self) -> bool;

    /// 列举目录（非递归；递归由 scanner 负责）。
    fn list(&self, relative_path: &str) -> Result<Vec<DirEntry>>;
    /// 完整读取小文件（NFO / 字幕等）。大文件请用 `open_reader`。
    fn read(&self, relative_path: &str) -> Result<Vec<u8>>;
    fn stat(&self, relative_path: &str) -> Result<Stat>;
    fn exists(&self, relative_path: &str) -> Result<bool>;
    /// 打开流式只读句柄（用于部分内容指纹）。
    fn open_reader(&self, relative_path: &str) -> Result<Box<dyn MediaReader>>;
    /// 连通性结论；不回传任何凭据。
    fn check_connectivity(&self) -> Connectivity;
}

// ============================================================
// LocalProvider（本地磁盘 + Windows UNC）
// ============================================================

/// 本地磁盘与 Windows UNC 共享的统一实现。
///
/// UNC 根（如 `\\NAS\Media`）与本地盘根（如 `D:\Media`）走同一套 `std::fs` 调用；
/// 差异仅在路径字符串解析。UNC 的认证由 Windows 会话在 OS 层完成，
/// 因此本结构体不含任何凭据字段。
pub struct LocalProvider {
    id: String,
    root: PathBuf,
    is_unc: bool,
}

impl LocalProvider {
    pub fn new(id: impl Into<String>, root: impl Into<PathBuf>) -> Self {
        let root = root.into();
        let is_unc = is_unc_root(&root.to_string_lossy());
        LocalProvider {
            id: id.into(),
            root,
            is_unc,
        }
    }

    pub fn root(&self) -> &Path {
        &self.root
    }

    pub fn is_unc(&self) -> bool {
        self.is_unc
    }

    fn resolve(&self, relative: &str) -> Result<PathBuf> {
        safe_join(&self.root, relative)
    }
}

impl MediaProvider for LocalProvider {
    fn id(&self) -> &str {
        &self.id
    }

    fn protocol(&self) -> SourceProtocol {
        if self.is_unc {
            SourceProtocol::Unc
        } else {
            SourceProtocol::Local
        }
    }

    fn validated(&self) -> bool {
        // 仅表示 std::fs 本地/UNC 访问路径为常规实现；仍未在本机跑过集成测试。
        // 保守起见返回 false，由 diagnostics 统一标注「未实机验证」。
        false
    }

    fn list(&self, relative_path: &str) -> Result<Vec<DirEntry>> {
        let dir = self.resolve(relative_path)?;
        let mut out = Vec::new();
        for entry in fs::read_dir(dir)? {
            let entry = entry?;
            let name = entry.file_name().to_string_lossy().into_owned();
            let metadata = entry.metadata()?;
            let modified_at = metadata.modified().ok().and_then(system_time_to_iso);
            out.push(DirEntry {
                name: name.clone(),
                relative_path: join_relative(relative_path, &name),
                is_dir: metadata.is_dir(),
                size_bytes: metadata.len(),
                modified_at,
            });
        }
        // 稳定排序，保证扫描顺序可复现，利于断点恢复游标。
        out.sort_by(|a, b| a.relative_path.cmp(&b.relative_path));
        Ok(out)
    }

    fn read(&self, relative_path: &str) -> Result<Vec<u8>> {
        let path = self.resolve(relative_path)?;
        Ok(fs::read(path)?)
    }

    fn stat(&self, relative_path: &str) -> Result<Stat> {
        let path = self.resolve(relative_path)?;
        let metadata = fs::metadata(path)?;
        Ok(Stat {
            is_dir: metadata.is_dir(),
            size_bytes: metadata.len(),
            modified_at: metadata.modified().ok().and_then(system_time_to_iso),
        })
    }

    fn exists(&self, relative_path: &str) -> Result<bool> {
        let path = self.resolve(relative_path)?;
        Ok(path.exists())
    }

    fn open_reader(&self, relative_path: &str) -> Result<Box<dyn MediaReader>> {
        let path = self.resolve(relative_path)?;
        let file = File::open(path)?;
        Ok(Box::new(file))
    }

    fn check_connectivity(&self) -> Connectivity {
        crate::network::test_local_path(&self.root)
    }
}

// ============================================================
// SmbProvider / WebDavProvider —— 未验证骨架
// ============================================================

/// SMB 协议 provider 骨架。
///
/// **状态：UNVALIDATED / NOT INTEGRATED**。计划接入 SMB 客户端库（或 Windows
/// `WNet` / UNC 会话）后再实现；当前所有 I/O 方法返回明确错误，绝不假装成功。
/// 凭据通过 [`CredentialRef`] 注入，结构体中不出现明文密码。
pub struct SmbProvider {
    id: String,
    /// `smb://host/share` 形式，不含 user:password。
    uri: String,
    credential: CredentialRef,
}

impl SmbProvider {
    pub fn new(id: impl Into<String>, uri: impl Into<String>, credential: CredentialRef) -> Self {
        SmbProvider {
            id: id.into(),
            uri: uri.into(),
            credential,
        }
    }

    pub fn uri(&self) -> &str {
        &self.uri
    }

    pub fn credential_ref(&self) -> &CredentialRef {
        &self.credential
    }

    fn unvalidated(op: &str) -> CoreError {
        CoreError::Unvalidated(format!(
            "SMB provider 未集成，无法执行 {}（需要 SMB 客户端与实机验证）",
            op
        ))
    }
}

impl MediaProvider for SmbProvider {
    fn id(&self) -> &str {
        &self.id
    }
    fn protocol(&self) -> SourceProtocol {
        SourceProtocol::Smb
    }
    fn validated(&self) -> bool {
        false
    }
    fn list(&self, _relative_path: &str) -> Result<Vec<DirEntry>> {
        Err(Self::unvalidated("list"))
    }
    fn read(&self, _relative_path: &str) -> Result<Vec<u8>> {
        Err(Self::unvalidated("read"))
    }
    fn stat(&self, _relative_path: &str) -> Result<Stat> {
        Err(Self::unvalidated("stat"))
    }
    fn exists(&self, _relative_path: &str) -> Result<bool> {
        Err(Self::unvalidated("exists"))
    }
    fn open_reader(&self, _relative_path: &str) -> Result<Box<dyn MediaReader>> {
        Err(Self::unvalidated("open_reader"))
    }
    fn check_connectivity(&self) -> Connectivity {
        Connectivity {
            ok: false,
            message: "SMB 连通性未验证：provider 尚未集成，无法确认可达性".to_string(),
            latency_ms: None,
        }
    }
}

/// WebDAV provider 骨架。
///
/// **状态：UNVALIDATED / NOT INTEGRATED**。计划使用 HTTP 客户端（PROPFIND / GET）
/// 实现；当前所有 I/O 方法返回明确错误。API Key / 密码从 [`CredentialRef`] 注入，
/// 不写入 `uri`、不保存明文。
pub struct WebDavProvider {
    id: String,
    /// `https://host/dav` 形式，不含 Basic Auth 凭据。
    uri: String,
    credential: CredentialRef,
}

impl WebDavProvider {
    pub fn new(id: impl Into<String>, uri: impl Into<String>, credential: CredentialRef) -> Self {
        WebDavProvider {
            id: id.into(),
            uri: uri.into(),
            credential,
        }
    }

    pub fn uri(&self) -> &str {
        &self.uri
    }

    pub fn credential_ref(&self) -> &CredentialRef {
        &self.credential
    }

    fn unvalidated(op: &str) -> CoreError {
        CoreError::Unvalidated(format!(
            "WebDAV provider 未集成，无法执行 {}（需要 HTTP PROPFIND/GET 与实机验证）",
            op
        ))
    }
}

impl MediaProvider for WebDavProvider {
    fn id(&self) -> &str {
        &self.id
    }
    fn protocol(&self) -> SourceProtocol {
        SourceProtocol::WebDav
    }
    fn validated(&self) -> bool {
        false
    }
    fn list(&self, _relative_path: &str) -> Result<Vec<DirEntry>> {
        Err(Self::unvalidated("list"))
    }
    fn read(&self, _relative_path: &str) -> Result<Vec<u8>> {
        Err(Self::unvalidated("read"))
    }
    fn stat(&self, _relative_path: &str) -> Result<Stat> {
        Err(Self::unvalidated("stat"))
    }
    fn exists(&self, _relative_path: &str) -> Result<bool> {
        Err(Self::unvalidated("exists"))
    }
    fn open_reader(&self, _relative_path: &str) -> Result<Box<dyn MediaReader>> {
        Err(Self::unvalidated("open_reader"))
    }
    fn check_connectivity(&self) -> Connectivity {
        Connectivity {
            ok: false,
            message: "WebDAV 连通性未验证：provider 尚未集成，无法确认可达性".to_string(),
            latency_ms: None,
        }
    }
}

// ============================================================
// ProviderRegistry
// ============================================================

/// provider 注册表：按源 ID 索引，便于未来无痛扩展
/// NFS / FTP / SFTP / Jellyfin / Emby / Plex 等实现。
#[derive(Default)]
pub struct ProviderRegistry {
    providers: HashMap<String, Arc<dyn MediaProvider>>,
}

impl ProviderRegistry {
    pub fn new() -> Self {
        ProviderRegistry {
            providers: HashMap::new(),
        }
    }

    pub fn register(&mut self, provider: Arc<dyn MediaProvider>) -> Result<()> {
        let id = provider.id().to_string();
        if self.providers.contains_key(&id) {
            return Err(CoreError::Config(format!("源 ID 重复: {}", id)));
        }
        self.providers.insert(id, provider);
        Ok(())
    }

    pub fn get(&self, id: &str) -> Option<Arc<dyn MediaProvider>> {
        self.providers.get(id).cloned()
    }

    pub fn remove(&mut self, id: &str) -> Result<()> {
        self.providers
            .remove(id)
            .map(|_| ())
            .ok_or_else(|| CoreError::NotFound(format!("源不存在: {}", id)))
    }

    pub fn ids(&self) -> Vec<String> {
        let mut ids: Vec<String> = self.providers.keys().cloned().collect();
        ids.sort();
        ids
    }

    pub fn len(&self) -> usize {
        self.providers.len()
    }

    pub fn is_empty(&self) -> bool {
        self.providers.is_empty()
    }
}

// ============================================================
// 单元测试（纯逻辑，可编译）
// ============================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn safe_join_rejects_traversal() {
        let root = Path::new("D:/Media");
        assert_eq!(
            safe_join(root, "Movies/a.mkv").unwrap(),
            root.join("Movies/a.mkv")
        );
        assert!(safe_join(root, "../secret").is_err());
        assert!(safe_join(root, "Movies/../../etc").is_err());
        assert!(safe_join(root, "..").is_err());
    }

    #[test]
    fn join_relative_is_platform_independent() {
        assert_eq!(join_relative("", "a.mkv"), "a.mkv");
        assert_eq!(join_relative("Movies", "a.mkv"), "Movies/a.mkv");
        assert_eq!(join_relative("/Movies/", "a.mkv"), "Movies/a.mkv");
    }

    #[test]
    fn unc_detection() {
        assert!(is_unc_root(r"\\NAS\Media"));
        assert!(is_unc_root("//NAS/Media"));
        assert!(!is_unc_root("D:/Media"));
        assert!(!is_unc_root("Media"));
    }

    #[test]
    fn secret_debug_is_redacted() {
        let s = Secret::new("example-value-not-a-secret");
        assert_eq!(format!("{:?}", s), "Secret(***)");
        assert_eq!(s.expose(), "example-value-not-a-secret");
    }

    #[test]
    fn credential_ref_never_embeds_secret() {
        // 引用只含键名/变量名，不含明文。
        let c = CredentialRef::Env {
            variable: "YINGMU_WEBDAV_TOKEN".to_string(),
        };
        let dumped = format!("{:?}", c);
        assert!(dumped.contains("YINGMU_WEBDAV_TOKEN"));
        assert!(!dumped.contains("example-value-not-a-secret"));
    }

    #[test]
    fn env_resolver_reports_missing_credential() {
        let resolver = EnvCredentialResolver;
        let missing = CredentialRef::Env {
            variable: "YINGMU_DEFINITELY_UNSET_VAR_FOR_TEST".to_string(),
        };
        // 不依赖真实环境，仅验证「无凭据时返回明确错误」这一契约。
        match resolver.resolve(&missing) {
            Err(CoreError::CredentialMissing(_)) => {}
            Ok(Some(_)) => { /* 若该变量恰好存在，也不视为失败：值来自环境，非硬编码 */
            }
            other => panic!("应返回凭据缺失错误，实际: {:?}", other),
        }
    }

    #[test]
    fn registry_register_get_remove() {
        let mut reg = ProviderRegistry::new();
        assert!(reg.is_empty());
        let p = Arc::new(LocalProvider::new("src-1", "D:/Media"));
        reg.register(p).unwrap();
        assert_eq!(reg.len(), 1);
        assert_eq!(reg.ids(), vec!["src-1".to_string()]);
        assert!(reg.get("src-1").is_some());
        // 重复注册必须报错。
        let dup = Arc::new(LocalProvider::new("src-1", "D:/Other"));
        assert!(reg.register(dup).is_err());
        reg.remove("src-1").unwrap();
        assert!(reg.get("src-1").is_none());
    }

    #[test]
    fn unvalidated_providers_never_fake_success() {
        let smb = SmbProvider::new("smb-1", "smb://nas/media", CredentialRef::None);
        assert!(!smb.validated());
        assert!(matches!(smb.list(""), Err(CoreError::Unvalidated(_))));
        assert!(!smb.check_connectivity().ok);

        let dav = WebDavProvider::new(
            "dav-1",
            "https://dav.example.com/media",
            CredentialRef::Env {
                variable: "YINGMU_WEBDAV_TOKEN".to_string(),
            },
        );
        assert!(!dav.validated());
        assert!(matches!(dav.stat("a.mkv"), Err(CoreError::Unvalidated(_))));
        assert!(!dav.check_connectivity().ok);
    }
}
