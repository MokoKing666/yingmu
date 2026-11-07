/**
 * PlatformBridge — 前端与平台层的唯一契约。
 *
 * 架构决策（见 docs/adr/0002-platform-bridge.md）：
 * - WebDemoBridge：浏览器 / Vite dev / CI 中运行，使用内置演示数据 + localStorage，
 *   使前端可以在没有 Rust 工具链的机器上真实运行、测试、截图。
 * - TauriBridge：通过类型安全 IPC 调用 Rust 核心，命令名与
 *   apps/desktop/src-tauri/src/commands/*.rs 一一对应。
 *
 * 禁止在 React 组件内直接调用 window.__TAURI__、fs 或任何平台 API。
 */

import type {
  MediaId,
  MediaItem,
  MediaSource,
  MediaVersion,
  SearchQuery,
  SearchResult,
  ScanProgress,
  PlaybackProgress,
  Playlist,
  PlaylistId,
  SourceId,
  ArtworkRequest,
  ThemeMode,
  MediaMetadata,
} from './types';

/** IPC 命令名常量：TypeScript 与 Rust 两侧必须完全一致 */
export const IPC = {
  libraryList: 'yingmu_library_list',
  libraryGet: 'yingmu_library_get',
  libraryUpdateMetadata: 'yingmu_library_update_metadata',
  librarySetFavorite: 'yingmu_library_set_favorite',
  libraryVersions: 'yingmu_library_versions',
  sourceList: 'yingmu_source_list',
  sourceAdd: 'yingmu_source_add',
  sourceRemove: 'yingmu_source_remove',
  sourceTest: 'yingmu_source_test',
  scanStart: 'yingmu_scan_start',
  scanCancel: 'yingmu_scan_cancel',
  scanStatus: 'yingmu_scan_status',
  search: 'yingmu_search',
  artworkGet: 'yingmu_artwork_get',
  artworkRebuild: 'yingmu_artwork_rebuild',
  historyList: 'yingmu_history_list',
  historySave: 'yingmu_history_save',
  playlistList: 'yingmu_playlist_list',
  playlistSave: 'yingmu_playlist_save',
  playlistRemove: 'yingmu_playlist_remove',
  playerOpen: 'yingmu_player_open',
  playerControl: 'yingmu_player_control',
  playerState: 'yingmu_player_state',
  playerAttachSurface: 'yingmu_player_attach_surface',
  settingsGet: 'yingmu_settings_get',
  settingsSet: 'yingmu_settings_set',
  diagnosticsReport: 'yingmu_diagnostics_report',
} as const;

export type IpcCommand = (typeof IPC)[keyof typeof IPC];

export interface AppSettings {
  theme: ThemeMode;
  language: 'zh-CN' | 'en-US';
  /** 播放器默认行为，不宣称任何 Dolby 认证能力 */
  preferHdrPassthrough: boolean;
  audioOutput: 'auto' | 'wasapi-shared' | 'wasapi-exclusive' | 'bitstream';
  subtitleFontSize: number;
  subtitleFontFamily: string;
  subtitleColor: string;
  subtitlePosition: number;
  subtitleDelayMs: number;
  hardwareDecoding: 'auto' | 'on' | 'off';
  resumeBehaviour: 'ask' | 'always' | 'never';
  tmdbConfigured: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'dark',
  language: 'zh-CN',
  preferHdrPassthrough: false,
  audioOutput: 'auto',
  subtitleFontSize: 24,
  subtitleFontFamily: 'MiSans',
  subtitleColor: '#FFFFFF',
  subtitlePosition: 88,
  subtitleDelayMs: 0,
  hardwareDecoding: 'auto',
  resumeBehaviour: 'ask',
  tmdbConfigured: false,
};

export interface DiagnosticsReport {
  appVersion: string;
  /** 播放器后端实际状态：未初始化时不得谎称可用 */
  backend: 'mpv' | 'none';
  backendReady: boolean;
  webview2Version?: string;
  gpuAdapter?: string;
  /** 仅代表已探测到的显示能力，不代表 HDR 原生输出已验证 */
  displayCaps?: {
    hdrSupported?: boolean;
    bitDepth?: number;
    colorSpace?: string;
  };
  dbVersion: number;
  notes: string[];
}

export interface PlatformBridge {
  readonly kind: 'web-demo' | 'tauri';

  libraryList(kind?: string): Promise<MediaItem[]>;
  libraryGet(id: MediaId): Promise<MediaItem | undefined>;
  libraryUpdateMetadata(id: MediaId, patch: Partial<MediaMetadata>): Promise<MediaItem>;
  librarySetFavorite(id: MediaId, favorite: boolean): Promise<void>;
  libraryVersions(id: MediaId): Promise<MediaVersion[]>;

  sourceList(): Promise<MediaSource[]>;
  sourceAdd(source: Omit<MediaSource, 'id' | 'status' | 'itemCount'>): Promise<MediaSource>;
  sourceRemove(id: SourceId): Promise<void>;
  /** 只返回连通性结论，不回传凭据 */
  sourceTest(id: SourceId): Promise<{ ok: boolean; message: string }>;

  scanStart(id: SourceId): Promise<void>;
  scanCancel(id: SourceId): Promise<void>;
  scanStatus(id: SourceId): Promise<ScanProgress>;

  search(query: SearchQuery): Promise<SearchResult>;
  artworkGet(req: ArtworkRequest): Promise<string>;
  artworkRebuild(): Promise<void>;

  historyList(): Promise<PlaybackProgress[]>;
  historySave(progress: PlaybackProgress): Promise<void>;

  playlistList(): Promise<Playlist[]>;
  playlistSave(playlist: Playlist): Promise<void>;
  playlistRemove(id: PlaylistId): Promise<void>;

  settingsGet(): Promise<AppSettings>;
  settingsSet(patch: Partial<AppSettings>): Promise<AppSettings>;

  diagnosticsReport(): Promise<DiagnosticsReport>;
}
