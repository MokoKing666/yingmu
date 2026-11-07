/**
 * PlayerBackend — 播放器统一抽象（与 React 页面解耦）
 *
 * 设计原则：
 * 1. React 组件只依赖本接口，不直接依赖 libmpv / D3D11 / WASAPI。
 * 2. 「原生视频 Surface」由平台层创建并嵌入 Tauri 窗口，前端只持有 handle；
 *    禁止用独立外部播放器窗口冒充嵌入式播放。
 * 3. 能力上报分 5 个层次，任何一层都不能由上一层推定成立：
 *    identified → metadataParsed → decoded → rendered → nativeOutput
 *    见 docs/dolby-compatibility/compatibility-matrix.md
 */

import type {
  MediaId,
  VersionId,
  AudioStreamInfo,
  SubtitleStreamInfo,
  Chapter,
  VideoStreamInfo,
} from '@yingmu/media-models';

/** 能力验证五层模型：读取到文件标识 ≠ 解码 ≠ 正确渲染 ≠ 原生输出 */
export type CapabilityStage =
  | 'identified'
  | 'metadata-parsed'
  | 'decoded'
  | 'rendered'
  | 'native-output';

export interface CapabilityClaim {
  feature: string;
  stage: CapabilityStage;
  /** 是否已经由本机实机验证；未验证一律 false */
  verified: boolean;
  evidence: string;
}

export type PlayerBackendState =
  | 'idle'
  | 'loading'
  | 'playing'
  | 'paused'
  | 'buffering'
  | 'seeking'
  | 'error'
  | 'stopped';

export interface PlayerMediaDescriptor {
  mediaId: MediaId;
  versionId: VersionId;
  /** 平台层解析出的可播放 URI；前端不接触本地绝对路径 */
  uri: string;
  startSeconds?: number;
  video?: VideoStreamInfo;
  audio: AudioStreamInfo[];
  subtitles: SubtitleStreamInfo[];
  chapters: Chapter[];
}

export interface PlayerState {
  state: PlayerBackendState;
  positionSeconds: number;
  durationSeconds: number;
  speed: number;
  volume: number;
  muted: boolean;
  paused: boolean;
  bufferingPercent: number;
  audioTrackIndex?: number;
  subtitleTrackIndex?: number;
  fullscreen: boolean;
  error?: string;
}

/** 实时解码统计（用于「视频信息 / 实时解码信息」面板） */
export interface DecodeStats {
  videoCodec?: string;
  audioCodec?: string;
  /** 硬件解码是否实际生效，而非「已请求」 */
  hwDecoderActive: boolean;
  displayedFps?: number;
  estimatedVsyncFps?: number;
  droppedFrames?: number;
  voDelayedFrames?: number;
  displaySyncRatio?: number;
  cacheDurationSeconds?: number;
  /** 实际像素格式 / 色彩空间，用于区分 HDR 识别与渲染 */
  outputPixelFormat?: string;
  outputColorSpace?: string;
  toneMappingActive?: boolean;
  audioOutputMode?: string;
}

export type PlayerCommand =
  | { type: 'play' | 'pause' | 'toggle' | 'stop' | 'frame-step' }
  | { type: 'seek'; seconds: number; exact?: boolean }
  | { type: 'set-speed'; speed: number }
  | { type: 'set-volume'; volume: number }
  | { type: 'set-muted'; muted: boolean }
  | { type: 'set-audio-track'; index: number }
  | { type: 'set-subtitle-track'; index: number | null }
  | { type: 'load-external-subtitle'; uri: string }
  | { type: 'set-subtitle-delay'; milliseconds: number }
  | { type: 'set-fullscreen'; fullscreen: boolean }
  | { type: 'chapter'; index: number };

export interface PlayerSurface {
  /** 平台层创建的原生视频 Surface 句柄；前端不解释其内容 */
  handle: string;
  /** 是否确实嵌入应用窗口（而非独立窗口） */
  embedded: boolean;
  /** 渲染后端标识，例如 d3d11 / gpu-next */
  renderer?: string;
}

export interface PlayerBackend {
  readonly name: string;
  /** 是否已完成本机技术验证；libmpv 未集成时必须为 false */
  readonly validated: boolean;

  initialize(): Promise<void>;
  /** 在 Tauri 窗口内创建/绑定原生视频 Surface */
  attachSurface(containerId: string): Promise<PlayerSurface>;
  detachSurface(): Promise<void>;

  open(media: PlayerMediaDescriptor): Promise<void>;
  command(cmd: PlayerCommand): Promise<void>;
  state(): Promise<PlayerState>;
  stats(): Promise<DecodeStats>;

  /** 只上报真实探测到的能力，未验证项 verified=false */
  capabilities(): CapabilityClaim[];

  onStateChange(listener: (state: PlayerState) => void): () => void;
  onStats(listener: (stats: DecodeStats) => void): () => void;
  dispose(): Promise<void>;
}
