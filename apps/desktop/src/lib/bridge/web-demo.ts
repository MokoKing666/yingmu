/**
 * WebDemoBridge — 浏览器 / Vite dev / CI 中的可运行实现
 *
 * 为什么存在（见 ADR 0002）：本机缺 Rust/MSVC 工具链时，前端仍必须能够
 * 真实启动、交互、截图与测试，而不是只有一张静态设计稿。
 * 本实现使用原创演示数据 + localStorage 持久化，绝不伪装成真实扫描结果。
 */

import type {
  PlatformBridge,
  AppSettings,
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
  DiagnosticsReport,
  MediaMetadata,
  LayoutPreferences,
} from '@yingmu/media-models';
import { DEFAULT_SETTINGS } from '@yingmu/media-models';
import {
  DEMO_SOURCES,
  DEMO_PLAYLISTS,
  buildDemoHistory,
  buildDemoLibrary,
} from '@/lib/demo-data';
import { getArtwork, rebuildArtworkCache } from '@/lib/artwork';
import { demoArtworkUrl } from '@/lib/demo-artwork';
import { truncate } from '@/lib/format';

const STORAGE_KEY = 'yingmu:web-demo:v1';
const LAYOUT_KEY = 'yingmu:layout-prefs:v2';

interface PersistedState {
  favorites: Record<MediaId, boolean>;
  settings: AppSettings;
  /** v1 的全局自定义序号；仅用于迁移，新代码一律走 layoutPrefs */
  customOrder: Record<MediaId, number>;
  metadataPatches: Record<MediaId, Partial<MediaMetadata>>;
  playlists: Playlist[];
  history: PlaybackProgress[];
  sources: MediaSource[];
}

const DEFAULT_STATE: PersistedState = {
  favorites: {},
  settings: DEFAULT_SETTINGS,
  customOrder: {},
  metadataPatches: {},
  playlists: DEMO_PLAYLISTS,
  history: [],
  sources: DEMO_SOURCES,
};

function readState(): PersistedState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_STATE };
    const parsed = JSON.parse(raw) as Partial<PersistedState>;
    return {
      favorites: parsed.favorites ?? {},
      settings: { ...DEFAULT_SETTINGS, ...(parsed.settings ?? {}) },
      customOrder: parsed.customOrder ?? {},
      metadataPatches: parsed.metadataPatches ?? {},
      playlists: parsed.playlists ?? DEMO_PLAYLISTS,
      history: parsed.history ?? [],
      sources: parsed.sources ?? DEMO_SOURCES,
    };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

function writeState(state: PersistedState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // 隐私模式或配额受限：内存态仍然有效，不抛出以避免中断 UI
  }
}

/* ------------------------------------------------------------------ */
/* 布局偏好（按作用域持久化）                                          */
/* ------------------------------------------------------------------ */

/**
 * 读取全部作用域的布局偏好。
 *
 * - 数据损坏时整体回退到空表（不让一条坏记录破坏整个媒体库排序）；
 * - v1 的全局 `customOrder` 会迁移到 `home` 作用域，老用户的拖拽结果不丢；
 * - 迁移完成后写回 v2 并清空 v1，避免下次再迁移一遍。
 */
function readLayoutPrefs(state: PersistedState): Record<string, LayoutPreferences> {
  let raw: string | null;
  try {
    raw = localStorage.getItem(LAYOUT_KEY);
  } catch {
    raw = null;
  }
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Record<string, Partial<LayoutPreferences>>;
      const out: Record<string, LayoutPreferences> = {};
      for (const [scope, pref] of Object.entries(parsed ?? {})) {
        if (!pref || typeof pref !== 'object') continue;
        out[scope] = {
          scope,
          sortMode: pref.sortMode ?? 'custom',
          orderedMediaIds: Array.isArray(pref.orderedMediaIds) ? pref.orderedMediaIds.filter((x) => typeof x === 'string') : [],
          updatedAt: typeof pref.updatedAt === 'string' ? pref.updatedAt : new Date(0).toISOString(),
        };
      }
      return out;
    } catch {
      return {}; // 损坏数据安全回退
    }
  }

  // v1 → v2 迁移：旧的全局 customOrder 语义上就是 home 作用域的自定义排列
  const legacy = state.customOrder ?? {};
  const ids = Object.entries(legacy)
    .sort((a, b) => a[1] - b[1])
    .map(([id]) => id);
  if (ids.length === 0) return {};
  const migrated: Record<string, LayoutPreferences> = {
    home: {
      scope: 'home',
      sortMode: 'custom',
      orderedMediaIds: ids,
      updatedAt: new Date().toISOString(),
    },
  };
  writeLayoutPrefs(migrated);
  state.customOrder = {};
  writeState(state);
  return migrated;
}

function writeLayoutPrefs(prefs: Record<string, LayoutPreferences>): void {
  try {
    localStorage.setItem(LAYOUT_KEY, JSON.stringify(prefs));
  } catch {
    // 隐私模式下写入失败：本次会话内仍然可用，不中断交互
  }
}

/** 把持久化补丁合并进演示数据，得到当前 UI 应展示的媒体库 */
function mergedLibrary(state: PersistedState): MediaItem[] {
  const items = buildDemoLibrary();
  return items.map((item) => {
    const favorite = state.favorites[item.id] ?? item.favorite;
    const patch = state.metadataPatches[item.id];
    const metadata = patch ? { ...item.metadata, ...patch, origin: 'manual' as const } : item.metadata;
    return { ...item, favorite, metadata };
  });
}

function matchesQuery(item: MediaItem, query: SearchQuery): boolean {
  if (query.favoritesOnly && !item.favorite) return false;
  if (query.kinds?.length && !query.kinds.includes(item.kind)) return false;
  if (query.yearFrom != null && (item.metadata.year ?? 0) < query.yearFrom) return false;
  if (query.yearTo != null && (item.metadata.year ?? 9999) > query.yearTo) return false;
  if (query.genres?.length && !query.genres.some((g) => item.metadata.genres.includes(g))) return false;

  const text = query.text.trim().toLowerCase();
  if (!text) return true;
  const haystack = [
    item.metadata.title,
    item.metadata.originalTitle ?? '',
    item.metadata.synopsis ?? '',
    ...item.metadata.directors,
    ...item.metadata.cast,
    ...item.metadata.genres,
    String(item.metadata.year ?? ''),
  ]
    .join(' ')
    .toLowerCase();
  return haystack.includes(text);
}

export class WebDemoBridge implements PlatformBridge {
  readonly kind = 'web-demo' as const;

  private state: PersistedState = readState();
  /** 按作用域保存的布局偏好；首次读取时完成 v1→v2 迁移 */
  private layoutPrefs: Record<string, LayoutPreferences> = readLayoutPrefs(this.state);

  private save(): void {
    writeState(this.state);
  }

  getCustomOrder(): Record<MediaId, number> {
    // 兼容入口：只反映 home 作用域的自定义排列（v1 语义）
    const home = this.layoutPrefs.home;
    const map: Record<MediaId, number> = {};
    home?.orderedMediaIds.forEach((id, index) => {
      map[id] = index;
    });
    return map;
  }

  setCustomOrder(order: Record<MediaId, number>): void {
    const ids = Object.entries(order)
      .sort((a, b) => a[1] - b[1])
      .map(([id]) => id);
    this.layoutSet('home', {
      scope: 'home',
      sortMode: 'custom',
      orderedMediaIds: ids,
      updatedAt: new Date().toISOString(),
    });
  }

  async layoutGet(scope: string): Promise<LayoutPreferences> {
    const found = this.layoutPrefs[scope];
    return found ? { ...found, orderedMediaIds: [...found.orderedMediaIds] } : {
      scope,
      sortMode: 'recommended',
      orderedMediaIds: [],
      updatedAt: new Date(0).toISOString(),
    };
  }

  async layoutSet(scope: string, preferences: LayoutPreferences): Promise<void> {
    this.layoutPrefs[scope] = {
      scope,
      sortMode: preferences.sortMode,
      orderedMediaIds: [...preferences.orderedMediaIds],
      updatedAt: preferences.updatedAt || new Date().toISOString(),
    };
    writeLayoutPrefs(this.layoutPrefs);
  }

  async libraryList(kind?: string): Promise<MediaItem[]> {
    const items = mergedLibrary(this.state);
    return kind ? items.filter((item) => item.kind === kind) : items;
  }

  async libraryGet(id: MediaId): Promise<MediaItem | undefined> {
    return mergedLibrary(this.state).find((item) => item.id === id);
  }

  async libraryUpdateMetadata(id: MediaId, patch: Partial<MediaMetadata>): Promise<MediaItem> {
    this.state.metadataPatches[id] = {
      ...(this.state.metadataPatches[id] ?? {}),
      ...patch,
    };
    this.save();
    const item = await this.libraryGet(id);
    if (!item) throw new Error(`媒体不存在：${id}`);
    return item;
  }

  async librarySetFavorite(id: MediaId, favorite: boolean): Promise<void> {
    this.state.favorites[id] = favorite;
    this.save();
  }

  async libraryVersions(id: MediaId): Promise<MediaVersion[]> {
    return (await this.libraryGet(id))?.versions ?? [];
  }

  async sourceList(): Promise<MediaSource[]> {
    return this.state.sources.map((s) => ({ ...s }));
  }

  async sourceAdd(source: Omit<MediaSource, 'id' | 'status' | 'itemCount'>): Promise<MediaSource> {
    const created: MediaSource = {
      ...source,
      id: `src-${Date.now().toString(36)}`,
      status: 'disconnected',
      itemCount: 0,
    };
    this.state.sources = [...this.state.sources, created];
    this.save();
    return created;
  }

  async sourceRemove(id: SourceId): Promise<void> {
    this.state.sources = this.state.sources.filter((s) => s.id !== id);
    this.save();
  }

  async sourceTest(_id: SourceId): Promise<{ ok: boolean; message: string }> {
    return {
      ok: false,
      message: '演示模式不发起真实网络连接；连通性测试需由 Rust Network Connection Manager 执行。',
    };
  }

  async scanStart(_id: SourceId): Promise<void> {
    // 演示模式不访问文件系统；这里只更新媒体源的展示状态，不产生任何「扫描结果」。
    this.state.sources = this.state.sources.map((s) =>
      s.id === _id ? { ...s, status: 'connected', lastScanAt: new Date().toISOString() } : s,
    );
    this.save();
  }

  async scanCancel(_id: SourceId): Promise<void> {
    this.state.sources = this.state.sources.map((s) =>
      s.id === _id ? { ...s, status: 'connected' } : s,
    );
    this.save();
  }

  async scanStatus(id: SourceId): Promise<ScanProgress> {
    const source = this.state.sources.find((s) => s.id === id);
    return {
      sourceId: id,
      state: 'idle',
      scanned: source?.itemCount ?? 0,
      discovered: source?.itemCount ?? 0,
      duplicates: 0,
      removed: 0,
      cancellable: false,
    };
  }

  async search(query: SearchQuery): Promise<SearchResult> {
    const items = mergedLibrary(this.state).filter((item) => matchesQuery(item, query));
    const offset = query.offset ?? 0;
    const limit = query.limit ?? 60;
    const paged = items.slice(offset, offset + limit);
    const snippets: Record<MediaId, string> = {};
    if (query.text.trim()) {
      for (const item of paged) {
        snippets[item.id] = truncate(item.metadata.synopsis || item.metadata.title, 90);
      }
    }
    return { items: paged, total: items.length, snippets };
  }

  async artworkGet(req: ArtworkRequest): Promise<string> {
    // 优先返回 public/artwork/ 下真实静态 SVG 素材；保留 getArtwork 的多尺寸缓存语义
    return getArtwork(req, (r) => demoArtworkUrl(r.mediaId, r.kind));
  }

  async artworkRebuild(): Promise<void> {
    rebuildArtworkCache();
  }

  async historyList(): Promise<PlaybackProgress[]> {
    if (this.state.history.length === 0) {
      return buildDemoHistory(mergedLibrary(this.state));
    }
    return [...this.state.history].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async historySave(progress: PlaybackProgress): Promise<void> {
    this.state.history = [
      progress,
      ...this.state.history.filter((h) => h.mediaId !== progress.mediaId),
    ];
    this.save();
  }

  async playlistList(): Promise<Playlist[]> {
    return this.state.playlists.map((p) => ({ ...p }));
  }

  async playlistSave(playlist: Playlist): Promise<void> {
    const exists = this.state.playlists.some((p) => p.id === playlist.id);
    this.state.playlists = exists
      ? this.state.playlists.map((p) => (p.id === playlist.id ? playlist : p))
      : [...this.state.playlists, playlist];
    this.save();
  }

  async playlistRemove(id: PlaylistId): Promise<void> {
    this.state.playlists = this.state.playlists.filter((p) => p.id !== id);
    this.save();
  }

  async settingsGet(): Promise<AppSettings> {
    return { ...this.state.settings };
  }

  async settingsSet(patch: Partial<AppSettings>): Promise<AppSettings> {
    this.state.settings = { ...this.state.settings, ...patch };
    this.save();
    return { ...this.state.settings };
  }

  async diagnosticsReport(): Promise<DiagnosticsReport> {
    return {
      appVersion: '0.1.0',
      backend: 'none',
      backendReady: false,
      webview2Version: undefined,
      dbVersion: 0,
      notes: [
        '当前运行于 WebDemoBridge（浏览器演示模式），未加载 Tauri 与 Rust 媒体核心。',
        'libmpv 播放器后端尚未集成，原生视频 Surface / HDR 输出 / Dolby 能力均未验证。',
        '媒体库为原创演示数据，不是真实文件扫描结果。',
      ],
    };
  }
}
