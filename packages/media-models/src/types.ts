/**
 * 影幕 YingMu — 全项目共享数据模型（唯一真源 / Single Source of Truth）
 *
 * 约定：
 * 1. TypeScript 侧（packages/media-models）与 Rust 侧（crates/yingmu-core/src/database/models.rs）
 *    字段一一对应，任何字段变更必须两侧同步并写 ADR。
 * 2. MediaId 是稳定内容标识，与文件路径解耦；路径变更不得导致 ID 变化。
 * 3. 所有时间戳使用 ISO 8601 字符串，跨语言序列化一致。
 * 4. 该层不含任何平台专属实现（无 window / fs / tauri 引用）。
 */

/** 稳定媒体 ID（UUID v5 风格，由内容指纹 + 命名空间派生，非路径） */
export type MediaId = string;
/** 媒体源 ID */
export type SourceId = string;
/** 同一媒体的不同版本（1080P / 4K / HDR / DV / 不同语言） */
export type VersionId = string;
/** 播放列表 ID */
export type PlaylistId = string;

export type MediaKind = 'movie' | 'tv' | 'anime' | 'documentary' | 'personal';

export type ThemeMode = 'dark' | 'light' | 'system';

/**
 * 排序模式。页面必须显式声明，而不是靠「customOrder 非空就全局生效」。
 * TS 与 Rust 两侧共用这套取值（serde 用字符串序列化）。
 */
export type SortMode = 'recommended' | 'recent' | 'year' | 'rating' | 'title' | 'custom';

/**
 * 布局偏好：某个作用域（首页 / 某个媒体库 / 收藏）的排序模式与自定义排列。
 * scope 是视图标识，例如 `home`、`library:movie`、`favorites`；
 * 不同 scope 的排列互不影响。
 */
export interface LayoutPreferences {
  scope: string;
  sortMode: SortMode;
  /** 有序的 Media ID 列表，只存用户真正摆放过的条目，允许部分覆盖 */
  orderedMediaIds: MediaId[];
  updatedAt: string;
}

export type MetadataOrigin = 'tmdb' | 'nfo' | 'local' | 'manual' | 'none';

export type SourceProtocol = 'local' | 'unc' | 'smb' | 'webdav';

export type SourceStatus = 'connected' | 'disconnected' | 'error' | 'scanning';

export type ScanState = 'idle' | 'scanning' | 'paused' | 'error';

/** 元数据：刮削失败时必须允许部分字段为空，且不得覆盖原始文件信息 */
export interface MediaMetadata {
  title: string;
  originalTitle?: string;
  year?: number;
  synopsis?: string;
  directors: string[];
  cast: string[];
  writers: string[];
  genres: string[];
  releaseDate?: string;
  /** 0–10 */
  rating?: number;
  posterPath?: string;
  backdropPath?: string;
  /**
   * 真实海报的宽高比（width / height），由刮削结果或本地图片探测填充。
   * 仅代表素材尺寸，不代表 HDR/Dolby 等播放能力。缺失时 UI 按媒体类型回退。
   */
  posterAspect?: number;
  /** 真实背景图 / 剧照的宽高比（width / height），超大横幅应优先使用它 */
  backdropAspect?: number;
  /** 真实缩略图 / 视频截帧的宽高比；个人视频应优先用它还原真实画幅 */
  thumbnailAspect?: number;
  seasonCount?: number;
  episodeCount?: number;
  origin: MetadataOrigin;
  /** TMDB ID 等外部标识，用于手动修正匹配 */
  externalIds?: Record<string, string>;
  updatedAt?: string;
}

/** 视频技术信息：识别结果，不等于具备对应渲染/输出能力 */
export interface VideoStreamInfo {
  codec: string;
  profile?: string;
  width: number;
  height: number;
  frameRate?: number;
  bitDepth?: number;
  /** 色彩空间标识，例如 bt2020nc / bt709 */
  colorSpace?: string;
  colorTransfer?: string;
  colorPrimaries?: string;
  /** HDR 格式标识：仅代表「文件识别」，不代表 HDR 原生输出 */
  hdrFormat?: 'hdr10' | 'hdr10plus' | 'hlg' | 'dolby-vision' | 'none';
  /** Dolby Vision Profile 识别结果（1–5 层分级见 docs/dolby-compatibility） */
  dolbyVisionProfile?: 5 | 7 | 8 | 81 | null;
  hasRpu?: boolean;
  hasEnhancementLayer?: boolean;
}

export interface AudioStreamInfo {
  index: number;
  codec: string;
  channels?: number;
  language?: string;
  title?: string;
  /** Dolby / DTS 音轨标识，仅代表识别 */
  format?:
    | 'ac3'
    | 'eac3'
    | 'eac3-joc'
    | 'truehd'
    | 'truehd-atmos'
    | 'dts'
    | 'dts-hd-ma'
    | 'dts-x'
    | 'flac'
    | 'aac'
    | 'pcm'
    | 'other';
  isDefault?: boolean;
}

export interface SubtitleStreamInfo {
  index: number;
  /** srt / ass / ssa / pgs / vobsub / webvtt */
  format: 'srt' | 'ass' | 'ssa' | 'pgs' | 'vobsub' | 'webvtt' | 'other';
  language?: string;
  title?: string;
  /** 外挂字幕标记为 external；内封与外挂分别管理 */
  external?: boolean;
  /** ASS 特效 / PGS 图片字幕必须保留原始渲染路径，禁止降级为纯文本 */
  requiresNativeRendering?: boolean;
}

/** 媒体文件版本：同一 MediaId 可有多个版本 */
export interface MediaVersion {
  id: VersionId;
  mediaId: MediaId;
  sourceId: SourceId;
  /** 相对媒体源根的路径；源地址变更时可重定位 */
  relativePath: string;
  /** 内容指纹（部分哈希 + 大小），用于去重与断点恢复 */
  fingerprint: string;
  sizeBytes: number;
  modifiedAt: string;
  durationSeconds?: number;
  container?: string;
  video?: VideoStreamInfo;
  audio: AudioStreamInfo[];
  subtitles: SubtitleStreamInfo[];
  chapters: Chapter[];
  /** 用户可读的版本标签，例如「4K HDR DV / 普通话」 */
  label: string;
  isDefault?: boolean;
}

export interface Chapter {
  index: number;
  title: string;
  startSeconds: number;
  endSeconds?: number;
}

export interface MediaItem {
  id: MediaId;
  kind: MediaKind;
  metadata: MediaMetadata;
  versions: MediaVersion[];
  addedAt: string;
  updatedAt: string;
  /** 收藏 */
  favorite: boolean;
  /** 用户自定义标签 */
  tags: string[];
  /** 首页幕墙布局权重（可被用户拖拽排序覆盖） */
  wallWeight?: number;
  /** 最近播放进度（秒），无记录为 undefined */
  resumeSeconds?: number;
  lastPlayedAt?: string;
  playCount: number;
}

export interface MediaSource {
  id: SourceId;
  name: string;
  protocol: SourceProtocol;
  /** 统一资源定位，凭据永远通过安全存储注入，不写入该字段 */
  uri: string;
  status: SourceStatus;
  /** 允许扫描的媒体类型 */
  kinds: MediaKind[];
  enabled: boolean;
  lastScanAt?: string;
  itemCount: number;
  /** 断点恢复游标 */
  scanCursor?: string;
  /** 是否需要凭据（布尔标记，绝不存放凭据本体） */
  requiresAuth: boolean;
}

export interface ScanProgress {
  sourceId: SourceId;
  state: ScanState;
  scanned: number;
  discovered: number;
  duplicates: number;
  removed: number;
  currentPath?: string;
  startedAt?: string;
  /** 可取消：前端通过 bridge.cancelScan 触发 */
  cancellable: boolean;
}

export interface PlaybackProgress {
  mediaId: MediaId;
  versionId: VersionId;
  positionSeconds: number;
  durationSeconds: number;
  completed: boolean;
  updatedAt: string;
}

export interface Playlist {
  id: PlaylistId;
  name: string;
  description?: string;
  mediaIds: MediaId[];
  createdAt: string;
  updatedAt: string;
}

export interface SearchQuery {
  text: string;
  kinds?: MediaKind[];
  favoritesOnly?: boolean;
  yearFrom?: number;
  yearTo?: number;
  genres?: string[];
  limit?: number;
  offset?: number;
}

/** FTS5 搜索结果 */
export interface SearchResult {
  items: MediaItem[];
  total: number;
  /** 全文检索命中高亮片段 */
  snippets?: Record<MediaId, string>;
}

export interface ArtworkRequest {
  mediaId: MediaId;
  kind: 'poster' | 'backdrop' | 'thumbnail';
  /** 目标尺寸档位；Artwork Cache 按档缓存 */
  size: 'sm' | 'md' | 'lg' | 'xl';
}

export interface TileLayout {
  mediaId: MediaId;
  /** 不规则幕墙网格跨度 */
  colSpan: number;
  rowSpan: number;
  /** 磁贴形态，决定封面裁切与信息密度 */
  variant: 'hero' | 'portrait-lg' | 'portrait-sm' | 'wide' | 'resume' | 'dynamic';
  order: number;
}
