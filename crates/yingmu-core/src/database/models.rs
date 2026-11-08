//! 影幕 YingMu — 跨语言共享数据模型（唯一真源在 TypeScript 侧）
//!
//! 本文件与下列文件字段一一对应，任何字段变更必须两侧同步并写 ADR：
//! - `packages/media-models/src/types.ts`
//! - `packages/media-models/src/bridge.ts`（AppSettings / DiagnosticsReport）
//!
//! 约定：
//! 1. 结构体统一 `#[serde(rename_all = "camelCase")]`，对齐 TS 的 camelCase 字段。
//! 2. 枚举尽量用显式 `#[serde(rename = "...")]` 精确匹配 TS 字面量联合类型，
//!    尤其是含连字符的值（dolby-vision / wasapi-shared / zh-CN 等）。
//! 3. TS 的 `field?: T` 对应 Rust `Option<T>`，并加 `skip_serializing_if = "Option::is_none"`，
//!    使序列化结果与「可选字段可缺省」一致，而不是发出一批 null。
//! 4. 所有时间戳使用 ISO 8601 字符串（String），跨语言一致，不在此层做时区解析。
//! 5. 该层不含任何平台专属实现（无 window / fs / tauri 引用）。

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

// ============================================================
// ID 别名（与 TS 的 type Xxx = string 对应）
// ============================================================

/// 稳定媒体 ID（UUID v5 风格，由内容指纹 + 命名空间派生，非路径）。
pub type MediaId = String;
pub type SourceId = String;
pub type VersionId = String;
pub type PlaylistId = String;

// ============================================================
// 枚举
// ============================================================

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum MediaKind {
    Movie,
    Tv,
    Anime,
    Documentary,
    Personal,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ThemeMode {
    Dark,
    Light,
    System,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum MetadataOrigin {
    Tmdb,
    Nfo,
    Local,
    Manual,
    None,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SourceProtocol {
    Local,
    Unc,
    Smb,
    /// 序列化为 "webdav"
    WebDav,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SourceStatus {
    Connected,
    Disconnected,
    Error,
    Scanning,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ScanState {
    Idle,
    Scanning,
    Paused,
    Error,
}

/// HDR 格式标识：仅代表「文件识别」，不代表 HDR 原生输出。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum HdrFormat {
    #[serde(rename = "hdr10")]
    Hdr10,
    #[serde(rename = "hdr10plus")]
    Hdr10Plus,
    #[serde(rename = "hlg")]
    Hlg,
    #[serde(rename = "dolby-vision")]
    DolbyVision,
    #[serde(rename = "none")]
    None,
}

/// Dolby / DTS 音轨标识，仅代表识别，不代表已具备解码/直通能力。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum AudioFormat {
    #[serde(rename = "ac3")]
    Ac3,
    #[serde(rename = "eac3")]
    Eac3,
    #[serde(rename = "eac3-joc")]
    Eac3Joc,
    #[serde(rename = "truehd")]
    Truehd,
    #[serde(rename = "truehd-atmos")]
    TruehdAtmos,
    #[serde(rename = "dts")]
    Dts,
    #[serde(rename = "dts-hd-ma")]
    DtsHdMa,
    #[serde(rename = "dts-x")]
    DtsX,
    #[serde(rename = "flac")]
    Flac,
    #[serde(rename = "aac")]
    Aac,
    #[serde(rename = "pcm")]
    Pcm,
    #[serde(rename = "other")]
    Other,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SubtitleFormat {
    Srt,
    Ass,
    Ssa,
    Pgs,
    Vobsub,
    Webvtt,
    Other,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ArtworkKind {
    Poster,
    Backdrop,
    Thumbnail,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ArtworkSize {
    Sm,
    Md,
    Lg,
    Xl,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum TileVariant {
    #[serde(rename = "hero")]
    Hero,
    #[serde(rename = "portrait-lg")]
    PortraitLg,
    #[serde(rename = "portrait-sm")]
    PortraitSm,
    #[serde(rename = "wide")]
    Wide,
    #[serde(rename = "resume")]
    Resume,
    #[serde(rename = "dynamic")]
    Dynamic,
}

// ---- AppSettings 相关枚举（来自 bridge.ts） ----

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Language {
    #[serde(rename = "zh-CN")]
    ZhCn,
    #[serde(rename = "en-US")]
    EnUs,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum AudioOutput {
    #[serde(rename = "auto")]
    Auto,
    #[serde(rename = "wasapi-shared")]
    WasapiShared,
    #[serde(rename = "wasapi-exclusive")]
    WasapiExclusive,
    #[serde(rename = "bitstream")]
    Bitstream,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum HardwareDecoding {
    Auto,
    On,
    Off,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ResumeBehaviour {
    Ask,
    Always,
    Never,
}

/// 播放器后端实际状态：未初始化时不得谎称可用。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Backend {
    Mpv,
    None,
}

// ============================================================
// 数据结构
// ============================================================

/// 元数据：刮削失败时必须允许部分字段为空，且不得覆盖原始文件信息。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaMetadata {
    pub title: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub original_title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub year: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub synopsis: Option<String>,
    pub directors: Vec<String>,
    pub cast: Vec<String>,
    pub writers: Vec<String>,
    pub genres: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub release_date: Option<String>,
    /// 0–10
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rating: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub poster_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub backdrop_path: Option<String>,
    /// 真实海报宽高比（width / height）。只代表素材尺寸，不代表播放能力。
    #[serde(skip_serializing_if = "Option::is_none")]
    pub poster_aspect: Option<f64>,
    /// 真实背景图 / 剧照宽高比；超大横幅应优先使用它
    #[serde(skip_serializing_if = "Option::is_none")]
    pub backdrop_aspect: Option<f64>,
    /// 真实缩略图 / 视频截帧宽高比；个人视频应优先用它还原真实画幅
    #[serde(skip_serializing_if = "Option::is_none")]
    pub thumbnail_aspect: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub season_count: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub episode_count: Option<i64>,
    pub origin: MetadataOrigin,
    /// TMDB ID 等外部标识，用于手动修正匹配。
    #[serde(skip_serializing_if = "Option::is_none")]
    pub external_ids: Option<HashMap<String, String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub updated_at: Option<String>,
}

/// 视频技术信息：识别结果，不等于具备对应渲染/输出能力。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VideoStreamInfo {
    pub codec: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub profile: Option<String>,
    pub width: i64,
    pub height: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub frame_rate: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bit_depth: Option<i64>,
    /// 色彩空间标识，例如 bt2020nc / bt709。
    #[serde(skip_serializing_if = "Option::is_none")]
    pub color_space: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub color_transfer: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub color_primaries: Option<String>,
    /// HDR 格式标识：仅代表「文件识别」，不代表 HDR 原生输出。
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hdr_format: Option<HdrFormat>,
    /// Dolby Vision Profile 识别结果（5 | 7 | 8 | 81 | null）。
    #[serde(skip_serializing_if = "Option::is_none")]
    pub dolby_vision_profile: Option<u8>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub has_rpu: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub has_enhancement_layer: Option<bool>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioStreamInfo {
    pub index: i64,
    pub codec: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub channels: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub language: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub format: Option<AudioFormat>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_default: Option<bool>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubtitleStreamInfo {
    pub index: i64,
    pub format: SubtitleFormat,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub language: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    /// 外挂字幕标记为 external；内封与外挂分别管理。
    #[serde(skip_serializing_if = "Option::is_none")]
    pub external: Option<bool>,
    /// ASS 特效 / PGS 图片字幕必须保留原始渲染路径，禁止降级为纯文本。
    #[serde(skip_serializing_if = "Option::is_none")]
    pub requires_native_rendering: Option<bool>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Chapter {
    pub index: i64,
    pub title: String,
    pub start_seconds: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub end_seconds: Option<f64>,
}

/// 媒体文件版本：同一 MediaId 可有多个版本。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaVersion {
    pub id: VersionId,
    pub media_id: MediaId,
    pub source_id: SourceId,
    /// 相对媒体源根的路径；源地址变更时可重定位。
    pub relative_path: String,
    /// 内容指纹（部分哈希 + 大小），用于去重与断点恢复。
    pub fingerprint: String,
    pub size_bytes: i64,
    pub modified_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub duration_seconds: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub container: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub video: Option<VideoStreamInfo>,
    pub audio: Vec<AudioStreamInfo>,
    pub subtitles: Vec<SubtitleStreamInfo>,
    pub chapters: Vec<Chapter>,
    /// 用户可读的版本标签，例如「4K HDR DV / 普通话」。
    pub label: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_default: Option<bool>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaItem {
    pub id: MediaId,
    pub kind: MediaKind,
    pub metadata: MediaMetadata,
    pub versions: Vec<MediaVersion>,
    pub added_at: String,
    pub updated_at: String,
    /// 收藏
    pub favorite: bool,
    /// 用户自定义标签
    pub tags: Vec<String>,
    /// 首页幕墙布局权重（可被用户拖拽排序覆盖）。
    #[serde(skip_serializing_if = "Option::is_none")]
    pub wall_weight: Option<f64>,
    /// 最近播放进度（秒），无记录为缺省。
    #[serde(skip_serializing_if = "Option::is_none")]
    pub resume_seconds: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_played_at: Option<String>,
    pub play_count: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaSource {
    pub id: SourceId,
    pub name: String,
    pub protocol: SourceProtocol,
    /// 统一资源定位，凭据永远通过安全存储注入，不写入该字段。
    pub uri: String,
    pub status: SourceStatus,
    /// 允许扫描的媒体类型
    pub kinds: Vec<MediaKind>,
    pub enabled: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_scan_at: Option<String>,
    pub item_count: i64,
    /// 断点恢复游标
    #[serde(skip_serializing_if = "Option::is_none")]
    pub scan_cursor: Option<String>,
    /// 是否需要凭据（布尔标记，绝不存放凭据本体）。
    pub requires_auth: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanProgress {
    pub source_id: SourceId,
    pub state: ScanState,
    pub scanned: i64,
    pub discovered: i64,
    pub duplicates: i64,
    pub removed: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub current_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub started_at: Option<String>,
    /// 可取消：前端通过 bridge.cancelScan 触发。
    pub cancellable: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaybackProgress {
    pub media_id: MediaId,
    pub version_id: VersionId,
    pub position_seconds: f64,
    pub duration_seconds: f64,
    pub completed: bool,
    pub updated_at: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Playlist {
    pub id: PlaylistId,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    pub media_ids: Vec<MediaId>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchQuery {
    pub text: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub kinds: Option<Vec<MediaKind>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub favorites_only: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub year_from: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub year_to: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub genres: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub limit: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub offset: Option<i64>,
}

/// FTS5 搜索结果
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchResult {
    pub items: Vec<MediaItem>,
    pub total: i64,
    /// 全文检索命中高亮片段
    #[serde(skip_serializing_if = "Option::is_none")]
    pub snippets: Option<HashMap<MediaId, String>>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ArtworkRequest {
    pub media_id: MediaId,
    pub kind: ArtworkKind,
    /// 目标尺寸档位；Artwork Cache 按档缓存。
    pub size: ArtworkSize,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TileLayout {
    pub media_id: MediaId,
    /// 不规则幕墙网格跨度
    pub col_span: i64,
    pub row_span: i64,
    /// 磁贴形态，决定封面裁切与信息密度。
    pub variant: TileVariant,
    pub order: i64,
}

// ============================================================
// bridge.ts: AppSettings / DEFAULT_SETTINGS
// ============================================================

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub theme: ThemeMode,
    pub language: Language,
    /// 播放器默认行为，不宣称任何 Dolby 认证能力。
    pub prefer_hdr_passthrough: bool,
    pub audio_output: AudioOutput,
    pub subtitle_font_size: i64,
    pub subtitle_font_family: String,
    pub subtitle_color: String,
    pub subtitle_position: i64,
    pub subtitle_delay_ms: i64,
    pub hardware_decoding: HardwareDecoding,
    pub resume_behaviour: ResumeBehaviour,
    pub tmdb_configured: bool,
}

/// 与 bridge.ts `DEFAULT_SETTINGS` 逐字段对齐的默认配置。
///
/// 采用函数而非常量：AppSettings 含 String 字段，稳定 Rust 中无法用
/// `String::from("...")` 构造 const，故提供 `default_settings()` 与 `Default` impl。
pub fn default_settings() -> AppSettings {
    AppSettings {
        theme: ThemeMode::Dark,
        language: Language::ZhCn,
        prefer_hdr_passthrough: false,
        audio_output: AudioOutput::Auto,
        subtitle_font_size: 24,
        subtitle_font_family: "MiSans".to_string(),
        subtitle_color: "#FFFFFF".to_string(),
        subtitle_position: 88,
        subtitle_delay_ms: 0,
        hardware_decoding: HardwareDecoding::Auto,
        resume_behaviour: ResumeBehaviour::Ask,
        tmdb_configured: false,
    }
}

impl Default for AppSettings {
    fn default() -> Self {
        default_settings()
    }
}

// ============================================================
// bridge.ts: DiagnosticsReport
// ============================================================

/// 仅代表已探测到的显示能力，不代表 HDR 原生输出已验证。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DisplayCaps {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hdr_supported: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bit_depth: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub color_space: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticsReport {
    pub app_version: String,
    /// 播放器后端实际状态：未初始化时不得谎称可用。
    pub backend: Backend,
    pub backend_ready: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub webview2_version: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub gpu_adapter: Option<String>,
    /// 仅代表已探测到的显示能力，不代表 HDR 原生输出已验证。
    #[serde(skip_serializing_if = "Option::is_none")]
    pub display_caps: Option<DisplayCaps>,
    pub db_version: i64,
    pub notes: Vec<String>,
}

// ============================================================
// bridge.ts: SortMode / LayoutPreferences（按作用域的布局偏好）
// ============================================================

/// 排序模式。与 `packages/media-models/src/types.ts` 的 `SortMode` 逐值对应。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub enum SortMode {
    #[default]
    Recommended,
    Recent,
    Year,
    Rating,
    Title,
    Custom,
}

impl SortMode {
    pub fn as_str(&self) -> &'static str {
        match self {
            SortMode::Recommended => "recommended",
            SortMode::Recent => "recent",
            SortMode::Year => "year",
            SortMode::Rating => "rating",
            SortMode::Title => "title",
            SortMode::Custom => "custom",
        }
    }

    /// 未知值安全回退到 recommended，不让一条脏数据把界面卡死。
    pub fn parse(s: &str) -> Self {
        match s {
            "recent" => SortMode::Recent,
            "year" => SortMode::Year,
            "rating" => SortMode::Rating,
            "title" => SortMode::Title,
            "custom" => SortMode::Custom,
            _ => SortMode::Recommended,
        }
    }
}

/// 某个作用域（首页 / 某个媒体库 / 收藏）的排序模式与自定义排列。
/// 与 bridge.ts 的 `LayoutPreferences` 字段一一对应（camelCase 序列化）。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LayoutPreferences {
    pub scope: String,
    pub sort_mode: SortMode,
    /// 有序 Media ID 列表；只存用户真正摆放过的条目，允许部分覆盖
    pub ordered_media_ids: Vec<String>,
    pub updated_at: String,
}

// ============================================================
// 单元测试：验证跨语言序列化契约（纯逻辑，可编译）
// ============================================================

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn enum_literals_match_typescript_unions() {
        assert_eq!(
            serde_json::to_value(MediaKind::Movie).unwrap(),
            json!("movie")
        );
        assert_eq!(serde_json::to_value(MediaKind::Tv).unwrap(), json!("tv"));
        assert_eq!(
            serde_json::to_value(SourceProtocol::WebDav).unwrap(),
            json!("webdav")
        );
        assert_eq!(
            serde_json::to_value(HdrFormat::DolbyVision).unwrap(),
            json!("dolby-vision")
        );
        assert_eq!(
            serde_json::to_value(AudioFormat::Eac3Joc).unwrap(),
            json!("eac3-joc")
        );
        assert_eq!(
            serde_json::to_value(AudioOutput::WasapiExclusive).unwrap(),
            json!("wasapi-exclusive")
        );
        assert_eq!(
            serde_json::to_value(TileVariant::PortraitLg).unwrap(),
            json!("portrait-lg")
        );
        assert_eq!(
            serde_json::to_value(Language::ZhCn).unwrap(),
            json!("zh-CN")
        );
        assert_eq!(serde_json::to_value(Backend::None).unwrap(), json!("none"));
    }

    #[test]
    fn struct_fields_use_camel_case_and_omit_none() {
        let m = MediaMetadata {
            title: "测试影片".to_string(),
            original_title: Some("Original".to_string()),
            year: Some(2024),
            synopsis: None,
            directors: vec!["导演A".to_string()],
            cast: vec![],
            writers: vec![],
            genres: vec!["剧情".to_string()],
            release_date: None,
            rating: Some(8.5),
            poster_path: None,
            backdrop_path: None,
            poster_aspect: None,
            backdrop_aspect: None,
            thumbnail_aspect: None,
            season_count: None,
            episode_count: None,
            origin: MetadataOrigin::Nfo,
            external_ids: None,
            updated_at: None,
        };
        let v = serde_json::to_value(&m).unwrap();
        let obj = v.as_object().unwrap();
        assert_eq!(obj.get("originalTitle").unwrap(), &json!("Original"));
        assert_eq!(obj.get("year").unwrap(), &json!(2024));
        assert_eq!(obj.get("origin").unwrap(), &json!("nfo"));
        // Option::None 字段必须省略，而不是发出 null。
        assert!(!obj.contains_key("synopsis"));
        assert!(!obj.contains_key("posterPath"));
        assert!(!obj.contains_key("externalIds"));
    }

    #[test]
    fn settings_roundtrip_and_defaults() {
        let s = default_settings();
        let txt = serde_json::to_string(&s).unwrap();
        let back: AppSettings = serde_json::from_str(&txt).unwrap();
        assert_eq!(s, back);
        assert_eq!(back.language, Language::ZhCn);
        assert!(!back.tmdb_configured);
        // 反序列化后仍是 camelCase 键。
        let v = serde_json::to_value(&s).unwrap();
        assert!(v.get("preferHdrPassthrough").is_some());
        assert!(v.get("resumeBehaviour").is_some());
    }

    #[test]
    fn diagnostics_report_shape_matches_bridge() {
        let r = DiagnosticsReport {
            app_version: "0.1.0".to_string(),
            backend: Backend::None,
            backend_ready: false,
            webview2_version: None,
            gpu_adapter: None,
            display_caps: None,
            db_version: 0,
            notes: vec!["未经探测的能力一律 not verified".to_string()],
        };
        let v = serde_json::to_value(&r).unwrap();
        assert_eq!(v.get("backend").unwrap(), &json!("none"));
        assert_eq!(v.get("backendReady").unwrap(), &json!(false));
        assert_eq!(v.get("dbVersion").unwrap(), &json!(0));
        assert!(v.get("displayCaps").is_none() || v.get("displayCaps").unwrap().is_null());
    }
}
