/**
 * 播放器 UI 状态（与 PlayerBackend 解耦）
 *
 * 当前 libmpv 后端尚未集成，因此这里只维护控制界面状态，
 * 不模拟时间推进、不伪造解码统计。播放器页面会明确提示后端状态。
 */

import { create } from 'zustand';
import type { MediaId, VersionId } from '@yingmu/media-models';

export type PlayerPanel = 'info' | 'subtitles' | 'audio' | 'chapters' | 'playlist' | null;

interface PlayerState {
  mediaId?: MediaId;
  versionId?: VersionId;
  isOpen: boolean;
  paused: boolean;
  speed: number;
  volume: number;
  muted: boolean;
  fullscreen: boolean;
  positionSeconds: number;
  durationSeconds: number;
  audioTrackIndex: number;
  subtitleTrackIndex: number | null;
  subtitleDelayMs: number;
  activePanel: PlayerPanel;
  controlsVisible: boolean;

  open: (mediaId: MediaId, versionId?: VersionId) => void;
  close: () => void;
  setDuration: (seconds: number) => void;
  seek: (seconds: number) => void;
  togglePause: () => void;
  setSpeed: (speed: number) => void;
  setVolume: (volume: number) => void;
  toggleMute: () => void;
  toggleFullscreen: () => void;
  setAudioTrack: (index: number) => void;
  setSubtitleTrack: (index: number | null) => void;
  setSubtitleDelay: (ms: number) => void;
  togglePanel: (panel: Exclude<PlayerPanel, null>) => void;
  setControlsVisible: (visible: boolean) => void;
}

export const usePlayerStore = create<PlayerState>((set, get) => ({
  mediaId: undefined,
  versionId: undefined,
  isOpen: false,
  paused: true,
  speed: 1,
  volume: 0.8,
  muted: false,
  fullscreen: false,
  positionSeconds: 0,
  durationSeconds: 0,
  audioTrackIndex: 0,
  subtitleTrackIndex: 0,
  subtitleDelayMs: 0,
  activePanel: null,
  controlsVisible: true,

  open: (mediaId, versionId) =>
    set({
      mediaId,
      versionId,
      isOpen: true,
      paused: true,
      positionSeconds: 0,
      activePanel: null,
      controlsVisible: true,
    }),
  close: () => set({ isOpen: false, activePanel: null, fullscreen: false }),
  setDuration: (seconds) => set({ durationSeconds: seconds }),
  seek: (seconds) =>
    set({ positionSeconds: Math.min(Math.max(0, seconds), get().durationSeconds || Number.MAX_SAFE_INTEGER) }),
  togglePause: () => set({ paused: !get().paused }),
  setSpeed: (speed) => set({ speed: Math.min(4, Math.max(0.25, speed)) }),
  setVolume: (volume) => set({ volume: Math.min(1, Math.max(0, volume)), muted: volume === 0 }),
  toggleMute: () => set({ muted: !get().muted }),
  toggleFullscreen: () => set({ fullscreen: !get().fullscreen }),
  setAudioTrack: (index) => set({ audioTrackIndex: index }),
  setSubtitleTrack: (index) => set({ subtitleTrackIndex: index }),
  setSubtitleDelay: (ms) => set({ subtitleDelayMs: Math.min(10000, Math.max(-10000, ms)) }),
  togglePanel: (panel) => set({ activePanel: get().activePanel === panel ? null : panel }),
  setControlsVisible: (visible) => set({ controlsVisible: visible }),
}));
