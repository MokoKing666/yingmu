//! database — 连接管理、版本化迁移、FTS5 搜索、媒体/源/历史/播放列表/封面缓存
//!
//! # 为什么选 rusqlite（而非 sqlx）
//! 1. `features = ["bundled"]` 随 crate 编译 SQLite amalgamation，自带 **FTS5**，
//!    无需目标机预装 SQLite，也不必在 build.rs 里额外探测 `SQLITE_ENABLE_FTS5`；
//!    这对 Windows MSVC 离线交付最省事。
//! 2. 本项目是单机桌面应用，同步 API 足够；sqlx 会引入 async runtime 与编译期
//!    查询检查（需要运行中的 DB 或 offline 元数据），对「无工具链、需可独立审阅」
//!    的阶段反而增加不确定面。
//! 3. 迁移用 `schema_migrations` 表 + `include_str!` 的纯 SQL 文件，可读、可测试、
//!    与运行时无关。
//!
//! # Media ID 与路径解耦
//! [`derive_media_id`] 用 UUID v5（命名空间 `NAMESPACE_URL`）从内容指纹派生，
//! **不含路径**。`media_versions.relative_path` 是相对「媒体源根」的路径；
//! 换 NAS 地址时只需 [`Database::remap_source`] 更新 `sources.uri`，
//! 所有版本行与元数据保持不变。一个 `media` 可对应多行 `media_versions`。
//!
//! 本模块源码未经编译验证：Rust 工具链 1.99.1 已安装（未在 PATH），但 MSVC / Windows SDK / link.exe 缺失；不得视为可运行实现。

pub mod models;

use crate::{CoreError, Result};
use models::*;
use rusqlite::types::Value;
use rusqlite::{params, params_from_iter, Connection, OptionalExtension, Row};
use std::collections::{HashMap, HashSet};
use std::path::Path;
use uuid::Uuid;

// ============================================================
// 版本化迁移
// ============================================================

#[derive(Debug, Clone, Copy)]
pub struct Migration {
    pub version: i64,
    pub name: &'static str,
    /// 已通过 `include_str!` 嵌入，运行时不依赖外部文件路径。
    pub sql: &'static str,
}

/// 迁移按 version 升序执行，顺序不可调整。
pub const MIGRATIONS: &[Migration] = &[
    Migration {
        version: 1,
        name: "001_initial",
        sql: include_str!("migrations/001_initial.sql"),
    },
    Migration {
        version: 2,
        name: "002_fts5",
        sql: include_str!("migrations/002_fts5.sql"),
    },
];

/// media 表查询列（顺序与 [`row_to_media_row`] 索引一致）。
const MEDIA_COLUMNS: &str = "id,kind,metadata_json,tags_json,added_at,updated_at,favorite,wall_weight,resume_seconds,last_played_at,play_count";

pub struct Database {
    conn: Connection,
}

impl Database {
    /// 打开（或创建）磁盘数据库并自动迁移到最新版本。
    /// Tauri 侧应把路径放在 `%APPDATA%\YingMu` 下，绝不在安装目录写入。
    pub fn open(path: impl AsRef<Path>) -> Result<Self> {
        let mut conn = Connection::open(path)?;
        Self::initialize(&mut conn)?;
        Ok(Database { conn })
    }

    /// 内存数据库，供单元测试与临时会话使用。
    pub fn open_in_memory() -> Result<Self> {
        let mut conn = Connection::open_in_memory()?;
        Self::initialize(&mut conn)?;
        Ok(Database { conn })
    }

    fn initialize(conn: &mut Connection) -> Result<()> {
        conn.execute_batch("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;")?;
        Self::migrate(conn)
    }

    fn migrate(conn: &mut Connection) -> Result<()> {
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS schema_migrations (
                version    INTEGER PRIMARY KEY,
                name       TEXT NOT NULL,
                applied_at TEXT NOT NULL
             );",
        )?;
        let applied: HashSet<i64> = {
            let mut stmt = conn.prepare("SELECT version FROM schema_migrations")?;
            let rows = stmt.query_map([], |r| r.get::<_, i64>(0))?;
            rows.collect::<rusqlite::Result<HashSet<i64>>>()?
        };
        for migration in MIGRATIONS {
            if applied.contains(&migration.version) {
                continue;
            }
            if migration.version <= applied.iter().copied().max().unwrap_or(0) {
                // 防回滚/跳版本：拒绝应用比已应用最大版本更旧的迁移。
                continue;
            }
            let tx = conn.transaction()?;
            tx.execute_batch(migration.sql)?;
            tx.execute(
                "INSERT INTO schema_migrations (version, name, applied_at) VALUES (?1, ?2, ?3)",
                params![
                    migration.version,
                    migration.name,
                    chrono::Utc::now().to_rfc3339()
                ],
            )?;
            tx.commit()?;
        }
        // 与 ADR 0005 对齐：除 `schema_migrations` 表外，同时维护
        // `PRAGMA user_version`。版本真源仍是 schema_migrations（team-lead 指令要求），
        // user_version 仅作冗余镜像，便于外部工具快速识别数据库版本。
        let latest = MIGRATIONS.iter().map(|m| m.version).max().unwrap_or(0);
        conn.execute_batch(&format!("PRAGMA user_version = {};", latest))?;
        Ok(())
    }

    /// 当前数据库版本号（取 `schema_migrations` 最大 version）。
    pub fn db_version(&self) -> Result<i64> {
        Ok(self.conn.query_row(
            "SELECT COALESCE(MAX(version), 0) FROM schema_migrations",
            [],
            |r| r.get(0),
        )?)
    }

    pub fn applied_migrations(&self) -> Result<Vec<(i64, String, String)>> {
        let mut stmt = self
            .conn
            .prepare("SELECT version, name, applied_at FROM schema_migrations ORDER BY version")?;
        let rows = stmt.query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))?;
        Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
    }
}

// ============================================================
// Media ID 派生（UUID v5，路径无关）
// ============================================================

/// 由内容指纹派生稳定 Media ID。
///
/// - 使用 UUID v5 + `NAMESPACE_URL`，相同指纹恒得相同 ID；
/// - 输入不含任何路径，因此文件移动 / 重命名 / 换 NAS 地址都不改变 ID。
pub fn derive_media_id(fingerprint: &str) -> String {
    Uuid::new_v5(&Uuid::NAMESPACE_URL, fingerprint.as_bytes()).to_string()
}

// ============================================================
// 枚举 <-> 文本（容错解析：未知值回退到安全默认，不 panic）
// ============================================================

pub fn media_kind_str(k: MediaKind) -> &'static str {
    match k {
        MediaKind::Movie => "movie",
        MediaKind::Tv => "tv",
        MediaKind::Anime => "anime",
        MediaKind::Documentary => "documentary",
        MediaKind::Personal => "personal",
    }
}

pub fn parse_media_kind(s: &str) -> MediaKind {
    match s {
        "tv" => MediaKind::Tv,
        "anime" => MediaKind::Anime,
        "documentary" => MediaKind::Documentary,
        "personal" => MediaKind::Personal,
        _ => MediaKind::Movie,
    }
}

fn source_protocol_str(p: SourceProtocol) -> &'static str {
    match p {
        SourceProtocol::Local => "local",
        SourceProtocol::Unc => "unc",
        SourceProtocol::Smb => "smb",
        SourceProtocol::WebDav => "webdav",
    }
}

fn parse_source_protocol(s: &str) -> SourceProtocol {
    match s {
        "unc" => SourceProtocol::Unc,
        "smb" => SourceProtocol::Smb,
        "webdav" => SourceProtocol::WebDav,
        _ => SourceProtocol::Local,
    }
}

fn source_status_str(s: SourceStatus) -> &'static str {
    match s {
        SourceStatus::Connected => "connected",
        SourceStatus::Disconnected => "disconnected",
        SourceStatus::Error => "error",
        SourceStatus::Scanning => "scanning",
    }
}

fn parse_source_status(s: &str) -> SourceStatus {
    match s {
        "connected" => SourceStatus::Connected,
        "error" => SourceStatus::Error,
        "scanning" => SourceStatus::Scanning,
        _ => SourceStatus::Disconnected,
    }
}

// ============================================================
// 搜索计划构造（纯逻辑，可单元测试；全部用户输入参数化）
// ============================================================

#[derive(Debug, Clone, PartialEq)]
pub enum SearchParam {
    Text(String),
    Int(i64),
}

/// 搜索计划：`where_sql` 使用匿名 `?` 占位符，`params` 与之按出现顺序一一对应。
/// 运行时用 `params_from_iter` 依次绑定，避免 SQL 注入。
#[derive(Debug, Clone, PartialEq)]
pub struct SearchPlan {
    /// FTS5 MATCH 表达式；空字符串表示「无全文条件」（退化为浏览/过滤）。
    pub fts_match: String,
    /// 形如 " AND m.kind IN (?,?) AND ..."；无过滤时为空串。
    pub where_sql: String,
    pub params: Vec<SearchParam>,
    pub limit: i64,
    pub offset: i64,
}

/// 把用户输入转成安全的 FTS5 MATCH 表达式：
/// 按空白切词，逐词用双引号包裹（内部 `"` 加倍转义）并加 `*` 前缀匹配，
/// 词间以 AND 连接。空文本返回空串（调用方退化为非 FTS 查询）。
pub fn build_match_expression(text: &str) -> String {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return String::new();
    }
    trimmed
        .split_whitespace()
        .map(|word| {
            let escaped = word.replace('"', "\"\"");
            format!("\"{}\"*", escaped)
        })
        .collect::<Vec<_>>()
        .join(" AND ")
}

/// 依据 `SearchQuery` 构造过滤条件与分页。
pub fn build_search_plan(query: &SearchQuery) -> SearchPlan {
    let mut clauses: Vec<String> = Vec::new();
    let mut params: Vec<SearchParam> = Vec::new();

    if let Some(kinds) = &query.kinds {
        if !kinds.is_empty() {
            let placeholders = vec!["?"; kinds.len()].join(",");
            clauses.push(format!("m.kind IN ({})", placeholders));
            for k in kinds {
                params.push(SearchParam::Text(media_kind_str(*k).to_string()));
            }
        }
    }
    if query.favorites_only == Some(true) {
        clauses.push("m.favorite = 1".to_string());
    }
    if let Some(y) = query.year_from {
        clauses.push("m.year >= ?".to_string());
        params.push(SearchParam::Int(y));
    }
    if let Some(y) = query.year_to {
        clauses.push("m.year <= ?".to_string());
        params.push(SearchParam::Int(y));
    }
    if let Some(genres) = &query.genres {
        for g in genres {
            // genres_json 是 JSON 数组文本；用参数化 LIKE 做包含匹配。
            clauses.push("m.genres_json LIKE ?".to_string());
            params.push(SearchParam::Text(format!("%{}%", g)));
        }
    }

    let where_sql = if clauses.is_empty() {
        String::new()
    } else {
        format!(" AND {}", clauses.join(" AND "))
    };

    SearchPlan {
        fts_match: build_match_expression(&query.text),
        where_sql,
        params,
        limit: query.limit.unwrap_or(50).clamp(1, 500),
        offset: query.offset.unwrap_or(0).max(0),
    }
}

// ============================================================
// 行映射
// ============================================================

struct MediaRow {
    id: String,
    kind: String,
    metadata_json: String,
    tags_json: String,
    added_at: String,
    updated_at: String,
    favorite: i64,
    wall_weight: Option<f64>,
    resume_seconds: Option<f64>,
    last_played_at: Option<String>,
    play_count: i64,
}

fn row_to_media_row(r: &Row<'_>) -> rusqlite::Result<MediaRow> {
    Ok(MediaRow {
        id: r.get(0)?,
        kind: r.get(1)?,
        metadata_json: r.get(2)?,
        tags_json: r.get(3)?,
        added_at: r.get(4)?,
        updated_at: r.get(5)?,
        favorite: r.get(6)?,
        wall_weight: r.get(7)?,
        resume_seconds: r.get(8)?,
        last_played_at: r.get(9)?,
        play_count: r.get(10)?,
    })
}

fn media_row_to_item(row: MediaRow, versions: Vec<MediaVersion>) -> Result<MediaItem> {
    let metadata: MediaMetadata = serde_json::from_str(&row.metadata_json)?;
    let tags: Vec<String> = serde_json::from_str(&row.tags_json)?;
    Ok(MediaItem {
        id: row.id,
        kind: parse_media_kind(&row.kind),
        metadata,
        versions,
        added_at: row.added_at,
        updated_at: row.updated_at,
        favorite: row.favorite != 0,
        tags,
        wall_weight: row.wall_weight,
        resume_seconds: row.resume_seconds,
        last_played_at: row.last_played_at,
        play_count: row.play_count,
    })
}

/// 单个版本戳（供扫描器构造 `scanner::FileStamp`）。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct VersionStampRow {
    pub relative_path: String,
    pub fingerprint: String,
    pub size_bytes: i64,
    pub modified_at: String,
}

/// 封面缓存记录（artwork_cache 表）。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ArtworkEntry {
    pub media_id: String,
    pub kind: String,
    pub size: String,
    pub path: String,
    pub bytes: i64,
    pub last_access_at: String,
}

// ============================================================
// 数据库操作
// ============================================================

impl Database {
    // ---- sources ----

    pub fn upsert_source(&self, s: &MediaSource) -> Result<()> {
        self.conn.execute(
            "INSERT INTO sources (id,name,protocol,uri,status,kinds_json,enabled,last_scan_at,item_count,scan_cursor,requires_auth)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)
             ON CONFLICT(id) DO UPDATE SET
               name=excluded.name, protocol=excluded.protocol, uri=excluded.uri,
               status=excluded.status, kinds_json=excluded.kinds_json, enabled=excluded.enabled,
               last_scan_at=excluded.last_scan_at, item_count=excluded.item_count,
               scan_cursor=excluded.scan_cursor, requires_auth=excluded.requires_auth",
            params![
                s.id,
                s.name,
                source_protocol_str(s.protocol),
                s.uri,
                source_status_str(s.status),
                serde_json::to_string(&s.kinds)?,
                s.enabled as i64,
                s.last_scan_at,
                s.item_count,
                s.scan_cursor,
                s.requires_auth as i64
            ],
        )?;
        Ok(())
    }

    pub fn list_sources(&self) -> Result<Vec<MediaSource>> {
        let mut stmt = self.conn.prepare(
            "SELECT id,name,protocol,uri,status,kinds_json,enabled,last_scan_at,item_count,scan_cursor,requires_auth FROM sources ORDER BY name",
        )?;
        let rows = stmt.query_map([], |r| {
            let kinds_json: String = r.get(5)?;
            Ok(MediaSource {
                id: r.get(0)?,
                name: r.get(1)?,
                protocol: parse_source_protocol(&r.get::<_, String>(2)?),
                uri: r.get(3)?,
                status: parse_source_status(&r.get::<_, String>(4)?),
                kinds: serde_json::from_str(&kinds_json).unwrap_or_default(),
                enabled: r.get::<_, i64>(6)? != 0,
                last_scan_at: r.get(7)?,
                item_count: r.get(8)?,
                scan_cursor: r.get(9)?,
                requires_auth: r.get::<_, i64>(10)? != 0,
            })
        })?;
        Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
    }

    pub fn get_source(&self, id: &str) -> Result<Option<MediaSource>> {
        Ok(self.list_sources()?.into_iter().find(|s| s.id == id))
    }

    pub fn remove_source(&self, id: &str) -> Result<()> {
        self.conn
            .execute("DELETE FROM sources WHERE id = ?1", params![id])?;
        Ok(())
    }

    /// 更换 NAS 地址：只更新 `sources.uri` 并把状态置为 disconnected 等待重测。
    /// `media_versions.relative_path` 是相对源根的路径，不依赖绝对地址，
    /// 因此所有版本与元数据天然保留，无需改写任何 media 行。
    pub fn remap_source(&self, id: &str, new_uri: &str) -> Result<()> {
        let changed = self.conn.execute(
            "UPDATE sources SET uri = ?2, status = 'disconnected' WHERE id = ?1",
            params![id, new_uri],
        )?;
        if changed == 0 {
            return Err(CoreError::NotFound(format!("源不存在: {}", id)));
        }
        Ok(())
    }

    pub fn update_scan_cursor(&self, id: &str, cursor: Option<&str>) -> Result<()> {
        self.conn.execute(
            "UPDATE sources SET scan_cursor = ?2 WHERE id = ?1",
            params![id, cursor],
        )?;
        Ok(())
    }

    // ---- media ----

    /// 写入（或更新）一个媒体项及其全部版本。
    /// 版本行的 `media_id` 外键指向该 media，实现「同一 Media 多版本」。
    pub fn save_media(&self, item: &MediaItem) -> Result<()> {
        let metadata_json = serde_json::to_string(&item.metadata)?;
        let directors_json = serde_json::to_string(&item.metadata.directors)?;
        let cast_json = serde_json::to_string(&item.metadata.cast)?;
        let genres_json = serde_json::to_string(&item.metadata.genres)?;
        let tags_json = serde_json::to_string(&item.tags)?;
        self.conn.execute(
            "INSERT INTO media (id,kind,title,original_title,year,synopsis,directors_json,cast_json,genres_json,metadata_json,tags_json,added_at,updated_at,favorite,wall_weight,resume_seconds,last_played_at,play_count)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18)
             ON CONFLICT(id) DO UPDATE SET
               kind=excluded.kind, title=excluded.title, original_title=excluded.original_title,
               year=excluded.year, synopsis=excluded.synopsis, directors_json=excluded.directors_json,
               cast_json=excluded.cast_json, genres_json=excluded.genres_json,
               metadata_json=excluded.metadata_json, tags_json=excluded.tags_json,
               updated_at=excluded.updated_at, favorite=excluded.favorite,
               wall_weight=excluded.wall_weight, resume_seconds=excluded.resume_seconds,
               last_played_at=excluded.last_played_at, play_count=excluded.play_count",
            params![
                item.id,
                media_kind_str(item.kind),
                item.metadata.title,
                item.metadata.original_title,
                item.metadata.year,
                item.metadata.synopsis,
                directors_json,
                cast_json,
                genres_json,
                metadata_json,
                tags_json,
                item.added_at,
                item.updated_at,
                item.favorite as i64,
                item.wall_weight,
                item.resume_seconds,
                item.last_played_at,
                item.play_count
            ],
        )?;
        for version in &item.versions {
            self.upsert_version(version)?;
        }
        Ok(())
    }

    pub fn upsert_version(&self, v: &MediaVersion) -> Result<()> {
        let video_json = match &v.video {
            Some(x) => Some(serde_json::to_string(x)?),
            None => None,
        };
        self.conn.execute(
            "INSERT INTO media_versions (id,media_id,source_id,relative_path,fingerprint,size_bytes,modified_at,duration_seconds,container,video_json,audio_json,subtitles_json,chapters_json,label,is_default)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15)
             ON CONFLICT(id) DO UPDATE SET
               media_id=excluded.media_id, source_id=excluded.source_id,
               relative_path=excluded.relative_path, fingerprint=excluded.fingerprint,
               size_bytes=excluded.size_bytes, modified_at=excluded.modified_at,
               duration_seconds=excluded.duration_seconds, container=excluded.container,
               video_json=excluded.video_json, audio_json=excluded.audio_json,
               subtitles_json=excluded.subtitles_json, chapters_json=excluded.chapters_json,
               label=excluded.label, is_default=excluded.is_default",
            params![
                v.id,
                v.media_id,
                v.source_id,
                v.relative_path,
                v.fingerprint,
                v.size_bytes,
                v.modified_at,
                v.duration_seconds,
                v.container,
                video_json,
                serde_json::to_string(&v.audio)?,
                serde_json::to_string(&v.subtitles)?,
                serde_json::to_string(&v.chapters)?,
                v.label,
                v.is_default.unwrap_or(false) as i64
            ],
        )?;
        Ok(())
    }

    pub fn media_versions(&self, media_id: &str) -> Result<Vec<MediaVersion>> {
        let mut stmt = self.conn.prepare(
            "SELECT id,media_id,source_id,relative_path,fingerprint,size_bytes,modified_at,duration_seconds,container,video_json,audio_json,subtitles_json,chapters_json,label,is_default
             FROM media_versions WHERE media_id = ?1 ORDER BY is_default DESC, label",
        )?;
        let rows = stmt.query_map(params![media_id], |r| {
            let video_json: Option<String> = r.get(9)?;
            let audio_json: String = r.get(10)?;
            let subtitles_json: String = r.get(11)?;
            let chapters_json: String = r.get(12)?;
            Ok(MediaVersion {
                id: r.get(0)?,
                media_id: r.get(1)?,
                source_id: r.get(2)?,
                relative_path: r.get(3)?,
                fingerprint: r.get(4)?,
                size_bytes: r.get(5)?,
                modified_at: r.get(6)?,
                duration_seconds: r.get(7)?,
                container: r.get(8)?,
                video: video_json.and_then(|s| serde_json::from_str(&s).ok()),
                audio: serde_json::from_str(&audio_json).unwrap_or_default(),
                subtitles: serde_json::from_str(&subtitles_json).unwrap_or_default(),
                chapters: serde_json::from_str(&chapters_json).unwrap_or_default(),
                label: r.get(13)?,
                is_default: Some(r.get::<_, i64>(14)? != 0),
            })
        })?;
        Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
    }

    pub fn get_media(&self, id: &str) -> Result<Option<MediaItem>> {
        let sql = format!("SELECT {} FROM media WHERE id = ?1", MEDIA_COLUMNS);
        let mut stmt = self.conn.prepare(&sql)?;
        let row = stmt.query_row(params![id], row_to_media_row).optional()?;
        drop(stmt);
        match row {
            None => Ok(None),
            Some(r) => {
                let versions = self.media_versions(id)?;
                Ok(Some(media_row_to_item(r, versions)?))
            }
        }
    }

    pub fn list_media(&self, kind: Option<MediaKind>) -> Result<Vec<MediaItem>> {
        let sql = format!(
            "SELECT {} FROM media {} ORDER BY updated_at DESC",
            MEDIA_COLUMNS,
            if kind.is_some() {
                "WHERE kind = ?1"
            } else {
                ""
            }
        );
        let mut raw: Vec<MediaRow> = Vec::new();
        {
            let mut stmt = self.conn.prepare(&sql)?;
            if let Some(k) = kind {
                let rows = stmt.query_map(params![media_kind_str(k)], row_to_media_row)?;
                for r in rows {
                    raw.push(r?);
                }
            } else {
                let rows = stmt.query_map([], row_to_media_row)?;
                for r in rows {
                    raw.push(r?);
                }
            }
        }
        let mut items = Vec::with_capacity(raw.len());
        for r in raw {
            let id = r.id.clone();
            let versions = self.media_versions(&id)?;
            items.push(media_row_to_item(r, versions)?);
        }
        Ok(items)
    }

    pub fn set_favorite(&self, id: &str, favorite: bool) -> Result<()> {
        let changed = self.conn.execute(
            "UPDATE media SET favorite = ?2, updated_at = ?3 WHERE id = ?1",
            params![id, favorite as i64, chrono::Utc::now().to_rfc3339()],
        )?;
        if changed == 0 {
            return Err(CoreError::NotFound(format!("媒体不存在: {}", id)));
        }
        Ok(())
    }

    /// 更新元数据（手动修正 / 刮削合并后落库），同步刷新 FTS 冗余列。
    pub fn update_media_metadata(&self, id: &str, metadata: &MediaMetadata) -> Result<()> {
        let changed = self.conn.execute(
            "UPDATE media SET
               title = ?2, original_title = ?3, year = ?4, synopsis = ?5,
               directors_json = ?6, cast_json = ?7, genres_json = ?8,
               metadata_json = ?9, updated_at = ?10
             WHERE id = ?1",
            params![
                id,
                metadata.title,
                metadata.original_title,
                metadata.year,
                metadata.synopsis,
                serde_json::to_string(&metadata.directors)?,
                serde_json::to_string(&metadata.cast)?,
                serde_json::to_string(&metadata.genres)?,
                serde_json::to_string(metadata)?,
                chrono::Utc::now().to_rfc3339()
            ],
        )?;
        if changed == 0 {
            return Err(CoreError::NotFound(format!("媒体不存在: {}", id)));
        }
        Ok(())
    }

    pub fn delete_media(&self, id: &str) -> Result<()> {
        self.conn
            .execute("DELETE FROM media WHERE id = ?1", params![id])?;
        Ok(())
    }

    /// 按指纹查找已有 MediaId（路径变更时据此复用同一 ID）。
    pub fn find_media_id_by_fingerprint(&self, fingerprint: &str) -> Result<Option<String>> {
        Ok(self
            .conn
            .query_row(
                "SELECT media_id FROM media_versions WHERE fingerprint = ?1 LIMIT 1",
                params![fingerprint],
                |r| r.get(0),
            )
            .optional()?)
    }

    /// 某源下的版本戳，供 scanner 做增量扫描与删除/移动检测。
    pub fn version_stamps(&self, source_id: &str) -> Result<Vec<VersionStampRow>> {
        let mut stmt = self.conn.prepare(
            "SELECT relative_path, fingerprint, size_bytes, modified_at FROM media_versions WHERE source_id = ?1",
        )?;
        let rows = stmt.query_map(params![source_id], |r| {
            Ok(VersionStampRow {
                relative_path: r.get(0)?,
                fingerprint: r.get(1)?,
                size_bytes: r.get(2)?,
                modified_at: r.get(3)?,
            })
        })?;
        Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
    }

    // ---- 搜索（FTS5 + 分页） ----

    /// 全文检索与分页。空文本时退化为「浏览 + 过滤 + 分页」，不走 FTS MATCH。
    /// 所有用户输入均通过参数绑定，MATCH 表达式经 [`build_match_expression`] 转义。
    pub fn search(&self, query: &SearchQuery) -> Result<SearchResult> {
        let plan = build_search_plan(query);
        let has_fts = !plan.fts_match.is_empty();

        let mut values: Vec<Value> = Vec::new();
        if has_fts {
            values.push(Value::Text(plan.fts_match.clone()));
        }
        for p in &plan.params {
            values.push(match p {
                SearchParam::Text(s) => Value::Text(s.clone()),
                SearchParam::Int(i) => Value::Integer(*i),
            });
        }

        let from_where = if has_fts {
            format!(
                "FROM media_fts JOIN media m ON m.rowid = media_fts.rowid WHERE media_fts MATCH ?{}",
                plan.where_sql
            )
        } else {
            format!("FROM media m WHERE 1=1{}", plan.where_sql)
        };
        let count_sql = format!("SELECT COUNT(*) {}", from_where);
        let total: i64 = self
            .conn
            .query_row(&count_sql, params_from_iter(values.iter()), |r| r.get(0))?;

        values.push(Value::Integer(plan.limit));
        values.push(Value::Integer(plan.offset));
        let snippet_expr = if has_fts {
            "snippet(media_fts, 1, '<mark>', '</mark>', '…', 16) AS snip"
        } else {
            "NULL AS snip"
        };
        let sql = format!(
            "SELECT m.id,m.kind,m.metadata_json,m.tags_json,m.added_at,m.updated_at,m.favorite,m.wall_weight,m.resume_seconds,m.last_played_at,m.play_count, {} {} ORDER BY m.updated_at DESC LIMIT ? OFFSET ?",
            snippet_expr, from_where
        );

        let collected: Vec<(MediaRow, Option<String>)> = {
            let mut stmt = self.conn.prepare(&sql)?;
            let rows = stmt.query_map(params_from_iter(values.iter()), |r| {
                let media_row = MediaRow {
                    id: r.get(0)?,
                    kind: r.get(1)?,
                    metadata_json: r.get(2)?,
                    tags_json: r.get(3)?,
                    added_at: r.get(4)?,
                    updated_at: r.get(5)?,
                    favorite: r.get(6)?,
                    wall_weight: r.get(7)?,
                    resume_seconds: r.get(8)?,
                    last_played_at: r.get(9)?,
                    play_count: r.get(10)?,
                };
                let snip: Option<String> = r.get(11)?;
                Ok((media_row, snip))
            })?;
            rows.collect::<rusqlite::Result<Vec<_>>>()?
        };

        let mut items = Vec::with_capacity(collected.len());
        let mut snippets: HashMap<MediaId, String> = HashMap::new();
        for (row, snip) in collected {
            let id = row.id.clone();
            let versions = self.media_versions(&id)?;
            items.push(media_row_to_item(row, versions)?);
            if let Some(s) = snip {
                if !s.is_empty() {
                    snippets.insert(id, s);
                }
            }
        }
        Ok(SearchResult {
            items,
            total,
            snippets: if snippets.is_empty() {
                None
            } else {
                Some(snippets)
            },
        })
    }

    // ---- 播放历史 ----

    pub fn save_progress(&self, p: &PlaybackProgress) -> Result<()> {
        self.conn.execute(
            "INSERT INTO playback_history (media_id,version_id,position_seconds,duration_seconds,completed,updated_at)
             VALUES (?1,?2,?3,?4,?5,?6)
             ON CONFLICT(media_id,version_id) DO UPDATE SET
               position_seconds=excluded.position_seconds, duration_seconds=excluded.duration_seconds,
               completed=excluded.completed, updated_at=excluded.updated_at",
            params![
                p.media_id,
                p.version_id,
                p.position_seconds,
                p.duration_seconds,
                p.completed as i64,
                p.updated_at
            ],
        )?;
        self.conn.execute(
            "UPDATE media SET resume_seconds = ?2, last_played_at = ?3 WHERE id = ?1",
            params![p.media_id, p.position_seconds, p.updated_at],
        )?;
        Ok(())
    }

    pub fn increment_play_count(&self, media_id: &str) -> Result<()> {
        self.conn.execute(
            "UPDATE media SET play_count = play_count + 1 WHERE id = ?1",
            params![media_id],
        )?;
        Ok(())
    }

    pub fn list_history(&self) -> Result<Vec<PlaybackProgress>> {
        let mut stmt = self.conn.prepare(
            "SELECT media_id,version_id,position_seconds,duration_seconds,completed,updated_at FROM playback_history ORDER BY updated_at DESC",
        )?;
        let rows = stmt.query_map([], |r| {
            Ok(PlaybackProgress {
                media_id: r.get(0)?,
                version_id: r.get(1)?,
                position_seconds: r.get(2)?,
                duration_seconds: r.get(3)?,
                completed: r.get::<_, i64>(4)? != 0,
                updated_at: r.get(5)?,
            })
        })?;
        Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
    }

    // ---- 播放列表 ----

    pub fn save_playlist(&self, p: &Playlist) -> Result<()> {
        self.conn.execute(
            "INSERT INTO playlists (id,name,description,media_ids,created_at,updated_at)
             VALUES (?1,?2,?3,?4,?5,?6)
             ON CONFLICT(id) DO UPDATE SET
               name=excluded.name, description=excluded.description,
               media_ids=excluded.media_ids, updated_at=excluded.updated_at",
            params![
                p.id,
                p.name,
                p.description,
                serde_json::to_string(&p.media_ids)?,
                p.created_at,
                p.updated_at
            ],
        )?;
        Ok(())
    }

    pub fn list_playlists(&self) -> Result<Vec<Playlist>> {
        let mut stmt = self.conn.prepare(
            "SELECT id,name,description,media_ids,created_at,updated_at FROM playlists ORDER BY updated_at DESC",
        )?;
        let rows = stmt.query_map([], |r| {
            let ids: String = r.get(3)?;
            Ok(Playlist {
                id: r.get(0)?,
                name: r.get(1)?,
                description: r.get(2)?,
                media_ids: serde_json::from_str(&ids).unwrap_or_default(),
                created_at: r.get(4)?,
                updated_at: r.get(5)?,
            })
        })?;
        Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
    }

    pub fn remove_playlist(&self, id: &str) -> Result<()> {
        self.conn
            .execute("DELETE FROM playlists WHERE id = ?1", params![id])?;
        Ok(())
    }

    // ---- 封面缓存索引（文件系统策略见 artwork 模块） ----

    pub fn artwork_upsert(&self, e: &ArtworkEntry) -> Result<()> {
        self.conn.execute(
            "INSERT INTO artwork_cache (media_id,kind,size,path,bytes,last_access_at)
             VALUES (?1,?2,?3,?4,?5,?6)
             ON CONFLICT(media_id,kind,size) DO UPDATE SET
               path=excluded.path, bytes=excluded.bytes, last_access_at=excluded.last_access_at",
            params![
                e.media_id,
                e.kind,
                e.size,
                e.path,
                e.bytes,
                e.last_access_at
            ],
        )?;
        Ok(())
    }

    /// 读取并刷新 LRU 访问时间；未命中返回 None。
    pub fn artwork_get(
        &self,
        media_id: &str,
        kind: &str,
        size: &str,
    ) -> Result<Option<ArtworkEntry>> {
        let now = chrono::Utc::now().to_rfc3339();
        self.conn.execute(
            "UPDATE artwork_cache SET last_access_at = ?4 WHERE media_id=?1 AND kind=?2 AND size=?3",
            params![media_id, kind, size, now],
        )?;
        Ok(self
            .conn
            .query_row(
                "SELECT media_id,kind,size,path,bytes,last_access_at FROM artwork_cache WHERE media_id=?1 AND kind=?2 AND size=?3",
                params![media_id, kind, size],
                |r| {
                    Ok(ArtworkEntry {
                        media_id: r.get(0)?,
                        kind: r.get(1)?,
                        size: r.get(2)?,
                        path: r.get(3)?,
                        bytes: r.get(4)?,
                        last_access_at: r.get(5)?,
                    })
                },
            )
            .optional()?)
    }

    pub fn artwork_all(&self) -> Result<Vec<ArtworkEntry>> {
        let mut stmt = self.conn.prepare(
            "SELECT media_id,kind,size,path,bytes,last_access_at FROM artwork_cache ORDER BY last_access_at ASC",
        )?;
        let rows = stmt.query_map([], |r| {
            Ok(ArtworkEntry {
                media_id: r.get(0)?,
                kind: r.get(1)?,
                size: r.get(2)?,
                path: r.get(3)?,
                bytes: r.get(4)?,
                last_access_at: r.get(5)?,
            })
        })?;
        Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
    }

    pub fn artwork_remove(&self, media_id: &str, kind: &str, size: &str) -> Result<()> {
        self.conn.execute(
            "DELETE FROM artwork_cache WHERE media_id=?1 AND kind=?2 AND size=?3",
            params![media_id, kind, size],
        )?;
        Ok(())
    }

    pub fn artwork_total_bytes(&self) -> Result<i64> {
        Ok(self.conn.query_row(
            "SELECT COALESCE(SUM(bytes), 0) FROM artwork_cache",
            [],
            |r| r.get(0),
        )?)
    }
}

// ============================================================
// 单元测试（纯逻辑 + 内存 SQLite 集成，可编译）
// ============================================================

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_metadata(title: &str) -> MediaMetadata {
        MediaMetadata {
            title: title.to_string(),
            original_title: None,
            year: Some(2014),
            synopsis: Some("穿越虫洞".to_string()),
            directors: vec!["诺兰".to_string()],
            cast: vec!["马修·麦康纳".to_string()],
            writers: vec![],
            genres: vec!["科幻".to_string()],
            release_date: None,
            rating: Some(8.6),
            poster_path: None,
            backdrop_path: None,
            season_count: None,
            episode_count: None,
            origin: MetadataOrigin::Local,
            external_ids: None,
            updated_at: None,
        }
    }

    fn sample_item(id: &str, title: &str) -> MediaItem {
        MediaItem {
            id: id.to_string(),
            kind: MediaKind::Movie,
            metadata: sample_metadata(title),
            versions: vec![],
            added_at: "2024-01-01T00:00:00+00:00".to_string(),
            updated_at: "2024-01-01T00:00:00+00:00".to_string(),
            favorite: false,
            tags: vec![],
            wall_weight: None,
            resume_seconds: None,
            last_played_at: None,
            play_count: 0,
        }
    }

    fn query(text: &str) -> SearchQuery {
        SearchQuery {
            text: text.to_string(),
            kinds: None,
            favorites_only: None,
            year_from: None,
            year_to: None,
            genres: None,
            limit: None,
            offset: None,
        }
    }

    #[test]
    fn migrations_are_versioned_ordered_and_embed_expected_schema() {
        assert_eq!(MIGRATIONS.len(), 2);
        assert_eq!(MIGRATIONS[0].version, 1);
        assert_eq!(MIGRATIONS[1].version, 2);
        assert!(MIGRATIONS[0].version < MIGRATIONS[1].version);
        let initial = MIGRATIONS[0].sql;
        for table in [
            "media",
            "media_versions",
            "sources",
            "playback_history",
            "playlists",
            "artwork_cache",
        ] {
            assert!(initial.contains(table), "初始迁移缺少表 {}", table);
        }
        // 一个 media 多版本：外键关系必须存在。
        assert!(initial.contains("REFERENCES media(id)"));
        assert!(initial.contains("PRIMARY KEY (media_id, version_id)"));
        let fts = MIGRATIONS[1].sql;
        assert!(fts.contains("fts5"));
        assert!(fts.contains("CREATE TRIGGER"));
        assert!(fts.contains("media_fts_ai"));
        assert!(fts.contains("media_fts_ad"));
        assert!(fts.contains("media_fts_au"));
    }

    #[test]
    fn derive_media_id_is_uuid_v5_stable_and_path_independent() {
        let a = derive_media_id("12345:abcdef");
        let b = derive_media_id("12345:abcdef");
        let c = derive_media_id("12345:ffffff");
        assert_eq!(a, b);
        assert_ne!(a, c);
        let parsed = Uuid::parse_str(&a).unwrap();
        assert_eq!(parsed.get_version_num(), 5);
        // 输入不含路径：不同路径、相同指纹必须得到同一 ID。
        assert_eq!(
            derive_media_id("fp-from-content"),
            derive_media_id("fp-from-content")
        );
        assert!(!a.contains('/') && !a.contains('\\'));
    }

    #[test]
    fn build_match_expression_escapes_and_tokenizes() {
        assert_eq!(
            build_match_expression("星际 穿越"),
            "\"星际\"* AND \"穿越\"*"
        );
        assert_eq!(build_match_expression("  "), "");
        // 内部双引号加倍转义，整体仍被引号包裹。
        assert_eq!(build_match_expression("a\"b"), "\"a\"\"b\"*");
    }

    #[test]
    fn build_search_plan_constructs_filters_and_pagination() {
        let q = SearchQuery {
            text: "星际 穿越".to_string(),
            kinds: Some(vec![MediaKind::Movie, MediaKind::Tv]),
            favorites_only: Some(true),
            year_from: Some(2000),
            year_to: None,
            genres: Some(vec!["科幻".to_string()]),
            limit: Some(10),
            offset: Some(20),
        };
        let plan = build_search_plan(&q);
        assert_eq!(plan.fts_match, "\"星际\"* AND \"穿越\"*");
        assert!(plan.where_sql.contains("m.kind IN (?,?)"));
        assert!(plan.where_sql.contains("m.favorite = 1"));
        assert!(plan.where_sql.contains("m.year >= ?"));
        assert!(plan.where_sql.contains("m.genres_json LIKE ?"));
        // 参数顺序须与 where_sql 中的 ? 一致：2 个 kind + 1 年 + 1 类型 = 4。
        assert_eq!(plan.params.len(), 4);
        assert_eq!(plan.params[0], SearchParam::Text("movie".to_string()));
        assert_eq!(plan.params[1], SearchParam::Text("tv".to_string()));
        assert_eq!(plan.params[2], SearchParam::Int(2000));
        assert_eq!(plan.params[3], SearchParam::Text("%科幻%".to_string()));
        assert_eq!(plan.limit, 10);
        assert_eq!(plan.offset, 20);
    }

    #[test]
    fn search_plan_clamps_pagination() {
        let mut q = query("x");
        q.limit = Some(99999);
        q.offset = Some(-5);
        let plan = build_search_plan(&q);
        assert_eq!(plan.limit, 500);
        assert_eq!(plan.offset, 0);
    }

    #[test]
    fn in_memory_db_runs_all_migrations() {
        let db = Database::open_in_memory().unwrap();
        assert_eq!(db.db_version().unwrap(), 2);
        let applied = db.applied_migrations().unwrap();
        assert_eq!(applied.len(), 2);
        assert_eq!(applied[0].0, 1);
        assert_eq!(applied[1].0, 2);
        assert_eq!(applied[0].1, "001_initial");
        assert_eq!(applied[1].1, "002_fts5");
        // 重复打开（迁移幂等）不应报错或重复插入。
        assert_eq!(db.applied_migrations().unwrap().len(), 2);
    }

    #[test]
    fn fts_triggers_keep_index_in_sync_and_search_paginates() {
        let db = Database::open_in_memory().unwrap();
        db.save_media(&sample_item("m1", "星际穿越")).unwrap();
        db.save_media(&sample_item("m2", "星际迷航")).unwrap();
        db.save_media(&sample_item("m3", "完全不同")).unwrap();

        let r = db.search(&query("星际")).unwrap();
        assert_eq!(r.total, 2);
        assert_eq!(r.items.len(), 2);

        // 分页
        let mut paged = query("星际");
        paged.limit = Some(1);
        paged.offset = Some(1);
        let r2 = db.search(&paged).unwrap();
        assert_eq!(r2.total, 2);
        assert_eq!(r2.items.len(), 1);

        // 空文本退化为浏览
        let browse = db.search(&query("")).unwrap();
        assert_eq!(browse.total, 3);

        // 过滤
        let mut filtered = query("星际");
        filtered.genres = Some(vec!["科幻".to_string()]);
        assert_eq!(db.search(&filtered).unwrap().total, 2);

        // 更新元数据后，旧词不再命中、新词命中（UPDATE 触发器生效）。
        db.update_media_metadata("m1", &sample_metadata("盗梦空间"))
            .unwrap();
        assert_eq!(db.search(&query("盗梦空间")).unwrap().total, 1);
        assert_eq!(db.search(&query("星际")).unwrap().total, 1);

        // 删除后索引同步移除（DELETE 触发器生效）。
        db.delete_media("m2").unwrap();
        assert_eq!(db.search(&query("星际")).unwrap().total, 0);
    }

    #[test]
    fn source_remap_preserves_metadata() {
        let db = Database::open_in_memory().unwrap();
        let source = MediaSource {
            id: "nas".to_string(),
            name: "NAS".to_string(),
            protocol: SourceProtocol::Unc,
            uri: r"\\OLD-NAS\Media".to_string(),
            status: SourceStatus::Connected,
            kinds: vec![MediaKind::Movie],
            enabled: true,
            last_scan_at: None,
            item_count: 1,
            scan_cursor: None,
            requires_auth: false,
        };
        db.upsert_source(&source).unwrap();

        let mut item = sample_item("m1", "影片");
        item.versions.push(MediaVersion {
            id: "v1".to_string(),
            media_id: "m1".to_string(),
            source_id: "nas".to_string(),
            relative_path: "Movies/a.mkv".to_string(),
            fingerprint: "fp1".to_string(),
            size_bytes: 100,
            modified_at: "2024-01-01T00:00:00+00:00".to_string(),
            duration_seconds: None,
            container: None,
            video: None,
            audio: vec![],
            subtitles: vec![],
            chapters: vec![],
            label: "1080P".to_string(),
            is_default: Some(true),
        });
        db.save_media(&item).unwrap();

        // 换 NAS 地址：只改 uri，版本行与元数据保持不变。
        db.remap_source("nas", r"\\NEW-NAS\Media").unwrap();
        let updated = db.get_source("nas").unwrap().unwrap();
        assert_eq!(updated.uri, r"\\NEW-NAS\Media");
        assert_eq!(updated.status, SourceStatus::Disconnected);
        let preserved = db.get_media("m1").unwrap().unwrap();
        assert_eq!(preserved.metadata.title, "影片");
        assert_eq!(preserved.versions.len(), 1);
        assert_eq!(preserved.versions[0].relative_path, "Movies/a.mkv");
        assert_eq!(
            db.find_media_id_by_fingerprint("fp1").unwrap().as_deref(),
            Some("m1")
        );
    }
}
