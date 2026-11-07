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
} from '@yingmu/media-models';
import { DEFAULT_SETTINGS } from '@yingmu/media-models';
import {
  DEMO_SOURCES,
  DEMO_PLAYLISTS,
  buildDemoHistory,
  buildDemoLibrary,
} from '@/lib/demo-data';
import { artworkDataUri, artworkDimensions, getArtwork, rebuildArtworkCache } from '@/lib/artwork';
import { truncate } from '@/lib/format';

const STORAGE_KEY = 'yingmu:web-demo:v1';

interface PersistedState {
  favorites: Record<MediaId, boolean>;
  settings: AppSettings;
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

  private save(): void {
    writeState(this.state);
  }

  getCustomOrder(): Record<MediaId, number> {
    return { ...this.state.customOrder };
  }

  setCustomOrder(order: Record<MediaId, number>): void {
    this.state.customOrder = order;
    this.save();
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
    const items = mergedLibrary(this.state);
    const item = items.find((m) => m.id === req.mediaId);
    return getArtwork(req, (r) => {
      const dim = artworkDimensions(r);
      return artworkDataUri({
        seed: r.mediaId,
        title: item?.metadata.title ?? '影幕',
        subtitle: item?.metadata.originalTitle?.toUpperCase() ?? 'YINGMU',
        width: dim.width,
        height: dim.height,
        composition: dim.composition,
      });
    });
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
