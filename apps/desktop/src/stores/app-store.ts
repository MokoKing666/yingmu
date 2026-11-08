import { create } from 'zustand';
import type {
  AppSettings,
  MediaId,
  MediaItem,
  MediaSource,
  MediaMetadata,
  PlaybackProgress,
  Playlist,
  PlaylistId,
  SourceId,
  ThemeMode,
} from '@yingmu/media-models';
import { getBridge, getFocalOverrides, setFocalOverrides } from '@/lib/bridge';
import type { FocalPoint } from '@/lib/bridge';
import {
  SCOPE_FAVORITES,
  SCOPE_HOME,
  emptyLayoutPreferences,
  libraryScope,
  normalizeScope,
} from '@/lib/layout-preferences';
import type { LayoutPreferences, SortMode } from '@yingmu/media-models';

/** 首次进入应用时预加载布局偏好的作用域集合（页面再按需补齐） */
const PREFETCH_SCOPES: string[] = [
  SCOPE_HOME,
  SCOPE_FAVORITES,
  libraryScope('movie'),
  libraryScope('tv'),
  libraryScope('anime'),
  libraryScope('documentary'),
  libraryScope('personal'),
];

export interface Toast {
  id: number;
  message: string;
  tone: 'info' | 'success' | 'error';
}

interface AppState {
  items: MediaItem[];
  sources: MediaSource[];
  playlists: Playlist[];
  history: PlaybackProgress[];
  settings: AppSettings;
  /** 按作用域保存的布局偏好（排序模式 + 自定义排列），互不污染 */
  layoutPrefs: Record<string, LayoutPreferences>;
  /** 用户为媒体手动调整的图片焦点（0..100），undefined 时使用引擎默认 */
  focalOverrides: Record<MediaId, FocalPoint>;
  isDemo: boolean;
  ready: boolean;
  error?: string;
  toasts: Toast[];

  initialize: () => Promise<void>;
  refresh: () => Promise<void>;
  getItem: (id: MediaId) => MediaItem | undefined;
  toggleFavorite: (id: MediaId) => Promise<void>;
  updateMetadata: (id: MediaId, patch: Partial<MediaMetadata>) => Promise<void>;
  addSource: (source: Omit<MediaSource, 'id' | 'status' | 'itemCount'>) => Promise<void>;
  removeSource: (id: SourceId) => Promise<void>;
  testSource: (id: SourceId) => Promise<{ ok: boolean; message: string }>;
  startScan: (id: SourceId) => Promise<void>;
  saveProgress: (progress: PlaybackProgress) => Promise<void>;
  savePlaylist: (playlist: Playlist) => Promise<void>;
  removePlaylist: (id: PlaylistId) => Promise<void>;
  setSettings: (patch: Partial<AppSettings>) => Promise<void>;
  /** 把某个作用域的排序模式写入偏好（并持久化） */
  setLayoutSortMode: (scope: string, mode: SortMode) => Promise<void>;
  /** 拖拽结束后把当前顺序写入该作用域；会把该作用域切到 custom 模式 */
  setWallOrder: (scope: string, orderedIds: MediaId[]) => Promise<void>;
  /** 读取某个作用域的布局偏好（无记录时给默认值） */
  getLayoutPref: (scope: string) => LayoutPreferences;
  /** undefined 表示恢复该媒体的默认焦点 */
  setArtworkFocal: (id: MediaId, focal: FocalPoint | undefined) => void;
  pushToast: (message: string, tone?: Toast['tone']) => void;
  dismissToast: (id: number) => void;
}

let toastSeq = 0;

export function resolveTheme(mode: ThemeMode): 'dark' | 'light' {
  if (mode === 'system') {
    if (typeof window !== 'undefined' && window.matchMedia) {
      return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    }
    return 'dark';
  }
  return mode;
}

export function applyTheme(mode: ThemeMode): void {
  if (typeof document !== 'undefined') {
    document.documentElement.dataset.theme = resolveTheme(mode);
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export const useAppStore = create<AppState>((set, get) => ({
  items: [],
  sources: [],
  playlists: [],
  history: [],
  settings: {
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
  },
  layoutPrefs: {},
  focalOverrides: getFocalOverrides(),
  isDemo: true,
  ready: false,
  toasts: [],

  initialize: async () => {
    const bridge = getBridge();
    applyTheme('dark');
    try {
      const [items, sources, playlists, history, settings, ...layoutResults] = await Promise.all([
        bridge.libraryList(),
        bridge.sourceList(),
        bridge.playlistList(),
        bridge.historyList(),
        bridge.settingsGet(),
        ...PREFETCH_SCOPES.map((scope) => bridge.layoutGet(scope)),
      ]);
      const layoutPrefs: Record<string, LayoutPreferences> = {};
      PREFETCH_SCOPES.forEach((scope, i) => {
        const pref = layoutResults[i] as LayoutPreferences | undefined;
        if (pref) layoutPrefs[scope] = pref;
      });
      // 支持通过 URL 参数强制指定主题，便于演示、截图与分享（不写入用户偏好）
      const hashQuery = typeof window !== 'undefined' ? window.location.hash.split('?')[1] ?? '' : '';
      const forcedTheme = new URLSearchParams(hashQuery).get('theme');
      applyTheme(forcedTheme === 'light' || forcedTheme === 'dark' ? forcedTheme : settings.theme);
      set({
        items,
        sources,
        playlists,
        history,
        settings,
        layoutPrefs,
        focalOverrides: getFocalOverrides(),
        isDemo: bridge.kind === 'web-demo',
        ready: true,
        error: undefined,
      });
    } catch (error) {
      set({ ready: true, error: errorMessage(error) });
    }
  },

  refresh: async () => {
    const bridge = getBridge();
    const [items, sources, playlists, history] = await Promise.all([
      bridge.libraryList(),
      bridge.sourceList(),
      bridge.playlistList(),
      bridge.historyList(),
    ]);
    set({ items, sources, playlists, history });
  },

  getItem: (id) => get().items.find((item) => item.id === id),

  toggleFavorite: async (id) => {
    const current = get().getItem(id);
    if (!current) return;
    const next = !current.favorite;
    // 乐观更新，失败时回滚
    set({ items: get().items.map((item) => (item.id === id ? { ...item, favorite: next } : item)) });
    try {
      await getBridge().librarySetFavorite(id, next);
      get().pushToast(next ? '已加入收藏' : '已取消收藏', 'success');
    } catch (error) {
      set({ items: get().items.map((item) => (item.id === id ? { ...item, favorite: !next } : item)) });
      get().pushToast(errorMessage(error), 'error');
    }
  },

  updateMetadata: async (id, patch) => {
    const updated = await getBridge().libraryUpdateMetadata(id, patch);
    set({ items: get().items.map((item) => (item.id === id ? updated : item)) });
    get().pushToast('媒体信息已保存', 'success');
  },

  addSource: async (source) => {
    await getBridge().sourceAdd(source);
    await get().refresh();
    get().pushToast('媒体源已添加（尚未连接验证）', 'info');
  },

  removeSource: async (id) => {
    await getBridge().sourceRemove(id);
    await get().refresh();
    get().pushToast('媒体源已移除', 'info');
  },

  testSource: (id) => getBridge().sourceTest(id),

  startScan: async (id) => {
    await getBridge().scanStart(id);
    await get().refresh();
  },

  saveProgress: async (progress) => {
    await getBridge().historySave(progress);
    set({ history: await getBridge().historyList() });
  },

  savePlaylist: async (playlist) => {
    await getBridge().playlistSave(playlist);
    set({ playlists: await getBridge().playlistList() });
    get().pushToast('播放列表已保存', 'success');
  },

  removePlaylist: async (id) => {
    await getBridge().playlistRemove(id);
    set({ playlists: await getBridge().playlistList() });
  },

  setSettings: async (patch) => {
    const settings = await getBridge().settingsSet(patch);
    applyTheme(settings.theme);
    set({ settings });
  },

  setLayoutSortMode: async (scope, mode) => {
    const key = normalizeScope(scope);
    const current = get().layoutPrefs[key] ?? emptyLayoutPreferences(key);
    const next: LayoutPreferences = {
      ...current,
      scope: key,
      sortMode: mode,
      updatedAt: new Date().toISOString(),
    };
    set({ layoutPrefs: { ...get().layoutPrefs, [key]: next } });
    try {
      await getBridge().layoutSet(key, next);
    } catch (error) {
      get().pushToast(`排序偏好保存失败：${errorMessage(error)}`, 'error');
    }
  },

  setWallOrder: async (scope, orderedIds) => {
    const key = normalizeScope(scope);
    const current = get().layoutPrefs[key] ?? emptyLayoutPreferences(key);
    // 已删除的媒体不允许残留在持久化顺序里（数据库层也会再过滤一次，双保险）
    const known = new Set(get().items.map((item) => item.id));
    const next: LayoutPreferences = {
      ...current,
      scope: key,
      // 拖拽是用户对「这一屏」的明确意图，因此该作用域切到自定义模式
      sortMode: 'custom',
      orderedMediaIds: orderedIds.filter((id) => known.has(id)),
      updatedAt: new Date().toISOString(),
    };
    set({ layoutPrefs: { ...get().layoutPrefs, [key]: next } });
    try {
      await getBridge().layoutSet(key, next);
    } catch (error) {
      get().pushToast(`排列保存失败：${errorMessage(error)}`, 'error');
    }
  },

  getLayoutPref: (scope) => {
    const key = normalizeScope(scope);
    return get().layoutPrefs[key] ?? emptyLayoutPreferences(key);
  },

  setArtworkFocal: (id, focal) => {
    const next = { ...get().focalOverrides };
    if (focal) next[id] = focal;
    else delete next[id];
    setFocalOverrides(next);
    set({ focalOverrides: next });
  },

  pushToast: (message, tone = 'info') => {
    toastSeq += 1;
    const id = toastSeq;
    set({ toasts: [...get().toasts, { id, message, tone }] });
    if (typeof window !== 'undefined') {
      window.setTimeout(() => get().dismissToast(id), 3600);
    }
  },

  dismissToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
}));
