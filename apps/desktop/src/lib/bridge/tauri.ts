/**
 * TauriBridge — 通过类型安全 IPC 调用 Rust 媒体核心
 *
 * 命令名必须与 apps/desktop/src-tauri/src/commands/*.rs 注册名一致，
 * 唯一真源是 packages/media-models/src/bridge.ts 的 IPC 常量。
 */

import {
  IPC,
  type PlatformBridge,
  type AppSettings,
  type MediaId,
  type MediaItem,
  type MediaSource,
  type MediaVersion,
  type SearchQuery,
  type SearchResult,
  type ScanProgress,
  type PlaybackProgress,
  type Playlist,
  type PlaylistId,
  type SourceId,
  type ArtworkRequest,
  type DiagnosticsReport,
  type MediaMetadata,
} from '@yingmu/media-models';

type Invoke = <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;

async function getInvoke(): Promise<Invoke> {
  try {
    const mod = await import('@tauri-apps/api/core');
    return mod.invoke as Invoke;
  } catch {
    throw new Error('Tauri 运行时不可用：请在影幕桌面应用中打开此页面。');
  }
}

async function call<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const invoke = await getInvoke();
  return invoke<T>(cmd, args);
}

export class TauriBridge implements PlatformBridge {
  readonly kind = 'tauri' as const;

  libraryList(kind?: string): Promise<MediaItem[]> {
    return call(IPC.libraryList, { kind });
  }
  libraryGet(id: MediaId): Promise<MediaItem | undefined> {
    return call(IPC.libraryGet, { id });
  }
  libraryUpdateMetadata(id: MediaId, patch: Partial<MediaMetadata>): Promise<MediaItem> {
    return call(IPC.libraryUpdateMetadata, { id, patch });
  }
  librarySetFavorite(id: MediaId, favorite: boolean): Promise<void> {
    return call(IPC.librarySetFavorite, { id, favorite });
  }
  libraryVersions(id: MediaId): Promise<MediaVersion[]> {
    return call(IPC.libraryVersions, { id });
  }
  sourceList(): Promise<MediaSource[]> {
    return call(IPC.sourceList);
  }
  sourceAdd(source: Omit<MediaSource, 'id' | 'status' | 'itemCount'>): Promise<MediaSource> {
    return call(IPC.sourceAdd, { source });
  }
  sourceRemove(id: SourceId): Promise<void> {
    return call(IPC.sourceRemove, { id });
  }
  sourceTest(id: SourceId): Promise<{ ok: boolean; message: string }> {
    return call(IPC.sourceTest, { id });
  }
  scanStart(id: SourceId): Promise<void> {
    return call(IPC.scanStart, { id });
  }
  scanCancel(id: SourceId): Promise<void> {
    return call(IPC.scanCancel, { id });
  }
  scanStatus(id: SourceId): Promise<ScanProgress> {
    return call(IPC.scanStatus, { id });
  }
  search(query: SearchQuery): Promise<SearchResult> {
    return call(IPC.search, { query });
  }
  artworkGet(req: ArtworkRequest): Promise<string> {
    return call(IPC.artworkGet, { req });
  }
  artworkRebuild(): Promise<void> {
    return call(IPC.artworkRebuild);
  }
  historyList(): Promise<PlaybackProgress[]> {
    return call(IPC.historyList);
  }
  historySave(progress: PlaybackProgress): Promise<void> {
    return call(IPC.historySave, { progress });
  }
  playlistList(): Promise<Playlist[]> {
    return call(IPC.playlistList);
  }
  playlistSave(playlist: Playlist): Promise<void> {
    return call(IPC.playlistSave, { playlist });
  }
  playlistRemove(id: PlaylistId): Promise<void> {
    return call(IPC.playlistRemove, { id });
  }
  settingsGet(): Promise<AppSettings> {
    return call(IPC.settingsGet);
  }
  settingsSet(patch: Partial<AppSettings>): Promise<AppSettings> {
    return call(IPC.settingsSet, { patch });
  }
  diagnosticsReport(): Promise<DiagnosticsReport> {
    return call(IPC.diagnosticsReport);
  }
}
