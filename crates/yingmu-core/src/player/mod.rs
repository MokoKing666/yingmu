//! player — 播放器后端抽象与五层能力模型
//!
//! # 状态：UNVALIDATED / NOT INTEGRATED（最高优先级声明）
//! 本模块**尚未集成 libmpv**，也**未验证**任何 HDR / Dolby Vision / 直通输出能力。
//! [`MpvBackend`] 只是 TS 侧 `PlayerBackend` 抽象的占位实现：所有会触发真实播放的
//! 方法都返回明确的「未验证」错误，绝不返回假成功，`validated()` 恒为 `false`。
//!
//! # Windows 集成前置条件（计划，尚未验证）
//! 1. 合法获取 `libmpv-2.dll`（及其 LGPL/GPL 许可义务），随安装包分发或运行时探测；
//! 2. 由平台层创建**原生视频 Surface**：拿到 WebView2 宿主窗口的 `HWND`，
//!    用 D3D11 / `gpu-next` 输出，把子窗口/Surface **嵌入应用窗口**，
//!    禁止用独立外部播放器窗口冒充嵌入式播放；
//! 3. 前端只持有 `PlayerSurface.handle`，不接触本地绝对路径或 HWND 细节。
//! 详见 `native/windows/README.md`（当前状态：未验证）。
//!
//! # 五层能力模型（任何一层都不能由上一层推定成立）
//! `identified`（读到文件标识）→ `metadata-parsed`（解析出流信息）→
//! `decoded`（成功解码）→ `rendered`（画面/字幕正确渲染）→
//! `native-output`（HDR/直通等原生输出）。
//! 识别到 HDR 标识 ≠ 解码 ≠ 正确渲染 ≠ HDR 原生输出。
//!
//! 本模块源码未经编译验证：Rust 工具链 1.99.1 已安装（未在 PATH），但 MSVC / Windows SDK / link.exe 缺失；不得视为可运行实现。

use crate::models::{
    AudioStreamInfo, Chapter, MediaId, SubtitleStreamInfo, VersionId, VideoStreamInfo,
};
use crate::{CoreError, Result};
use serde::{Deserialize, Serialize};

// ============================================================
// 五层能力模型（对应 player-api/index.ts）
// ============================================================

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum CapabilityStage {
    #[serde(rename = "identified")]
    Identified,
    #[serde(rename = "metadata-parsed")]
    MetadataParsed,
    #[serde(rename = "decoded")]
    Decoded,
    #[serde(rename = "rendered")]
    Rendered,
    #[serde(rename = "native-output")]
    NativeOutput,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CapabilityClaim {
    pub feature: String,
    pub stage: CapabilityStage,
    /// 是否已经由本机实机验证；未验证一律 false。
    pub verified: bool,
    pub evidence: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PlayerBackendState {
    Idle,
    Loading,
    Playing,
    Paused,
    Buffering,
    Seeking,
    Error,
    Stopped,
}

/// 平台层解析出的可播放媒体描述（前端不接触本地绝对路径语义由平台层保证）。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlayerMediaDescriptor {
    pub media_id: MediaId,
    pub version_id: VersionId,
    pub uri: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub start_seconds: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub video: Option<VideoStreamInfo>,
    pub audio: Vec<AudioStreamInfo>,
    pub subtitles: Vec<SubtitleStreamInfo>,
    pub chapters: Vec<Chapter>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlayerState {
    pub state: PlayerBackendState,
    pub position_seconds: f64,
    pub duration_seconds: f64,
    pub speed: f64,
    pub volume: f64,
    pub muted: bool,
    pub paused: bool,
    pub buffering_percent: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub audio_track_index: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub subtitle_track_index: Option<i64>,
    pub fullscreen: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

impl Default for PlayerState {
    fn default() -> Self {
        PlayerState {
            state: PlayerBackendState::Idle,
            position_seconds: 0.0,
            duration_seconds: 0.0,
            speed: 1.0,
            volume: 1.0,
            muted: false,
            paused: true,
            buffering_percent: 0.0,
            audio_track_index: None,
            subtitle_track_index: None,
            fullscreen: false,
            error: None,
        }
    }
}

/// 实时解码统计（用于「视频信息 / 实时解码信息」面板）。
/// 未解码时全部为缺省或 false，绝不填充推测值。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DecodeStats {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub video_codec: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub audio_codec: Option<String>,
    /// 硬件解码是否实际生效，而非「已请求」。
    pub hw_decoder_active: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub displayed_fps: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub estimated_vsync_fps: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub dropped_frames: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub vo_delayed_frames: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub display_sync_ratio: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cache_duration_seconds: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub output_pixel_format: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub output_color_space: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tone_mapping_active: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub audio_output_mode: Option<String>,
}

impl Default for DecodeStats {
    fn default() -> Self {
        DecodeStats {
            video_codec: None,
            audio_codec: None,
            hw_decoder_active: false,
            displayed_fps: None,
            estimated_vsync_fps: None,
            dropped_frames: None,
            vo_delayed_frames: None,
            display_sync_ratio: None,
            cache_duration_seconds: None,
            output_pixel_format: None,
            output_color_space: None,
            tone_mapping_active: None,
            audio_output_mode: None,
        }
    }
}

/// 播放器命令（tagged union，与 TS `PlayerCommand` 一一对应）。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "kebab-case")]
pub enum PlayerCommand {
    Play,
    Pause,
    Toggle,
    Stop,
    FrameStep,
    Seek {
        seconds: f64,
        #[serde(skip_serializing_if = "Option::is_none")]
        exact: Option<bool>,
    },
    SetSpeed {
        speed: f64,
    },
    SetVolume {
        volume: f64,
    },
    SetMuted {
        muted: bool,
    },
    SetAudioTrack {
        index: i64,
    },
    /// `index = null` 表示关闭字幕。
    SetSubtitleTrack {
        index: Option<i64>,
    },
    LoadExternalSubtitle {
        uri: String,
    },
    SetSubtitleDelay {
        milliseconds: i64,
    },
    SetFullscreen {
        fullscreen: bool,
    },
    Chapter {
        index: i64,
    },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlayerSurface {
    /// 平台层创建的原生视频 Surface 句柄；前端不解释其内容。
    pub handle: String,
    /// 是否确实嵌入应用窗口（而非独立窗口）。
    pub embedded: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub renderer: Option<String>,
}

pub type ListenerId = u64;
pub type StateListener = Box<dyn Fn(&PlayerState) + Send + Sync>;
pub type StatsListener = Box<dyn Fn(&DecodeStats) + Send + Sync>;

/// 播放器后端统一抽象（对应 `packages/player-api/src/index.ts` 的 PlayerBackend）。
///
/// 事件订阅由平台层 Tauri 事件总线承担，这里保留签名以便未来接线。
pub trait PlayerBackend: Send + Sync {
    fn name(&self) -> &str;
    /// 是否已完成本机技术验证；libmpv 未集成时必须为 false。
    fn validated(&self) -> bool;

    fn initialize(&mut self) -> Result<()>;
    fn attach_surface(&mut self, container_id: &str) -> Result<PlayerSurface>;
    fn detach_surface(&mut self) -> Result<()>;
    fn open(&mut self, media: &PlayerMediaDescriptor) -> Result<()>;
    fn command(&mut self, cmd: &PlayerCommand) -> Result<()>;
    fn state(&self) -> Result<PlayerState>;
    fn stats(&self) -> Result<DecodeStats>;
    /// 只上报真实探测到的能力；未验证项 verified=false。
    fn capabilities(&self) -> Vec<CapabilityClaim>;

    fn on_state_change(&mut self, listener: StateListener) -> ListenerId;
    fn on_stats(&mut self, listener: StatsListener) -> ListenerId;
    fn remove_listener(&mut self, id: ListenerId);
    fn dispose(&mut self) -> Result<()>;
}

// ============================================================
// MpvBackend —— 明确标注 UNVALIDATED / NOT INTEGRATED
// ============================================================

/// libmpv 播放器后端的**占位**实现。
///
/// - `validated()` 恒为 `false`；
/// - `initialize` / `attach_surface` / `open` / `command` 一律返回
///   `CoreError::Unvalidated`，绝不假装能播放；
/// - `state()` 只返回真实的初始 `Idle` 状态，`stats()` 返回全空统计；
/// - `capabilities()` 返回覆盖五层的声明，全部 `verified=false`。
#[derive(Default)]
pub struct MpvBackend {
    state: PlayerState,
    surface: Option<PlayerSurface>,
    state_listeners: Vec<(ListenerId, StateListener)>,
    stats_listeners: Vec<(ListenerId, StatsListener)>,
    next_listener_id: ListenerId,
}

impl MpvBackend {
    pub fn new() -> Self {
        MpvBackend {
            state: PlayerState::default(),
            surface: None,
            state_listeners: Vec::new(),
            stats_listeners: Vec::new(),
            next_listener_id: 1,
        }
    }

    fn integration_error(operation: &str) -> CoreError {
        CoreError::Unvalidated(format!(
            "libmpv 未集成 / 未实机验证，无法执行 {}：Windows 下需 libmpv-2.dll、\
             D3D11 原生视频 Surface 与嵌入 WebView2 宿主窗口的 HWND；\
             当前没有可播放后端，也未验证 HDR/Dolby 输出",
            operation
        ))
    }

    /// 五层能力声明：全部未验证，逐层说明不能由上一层推定成立。
    pub fn unverified_capabilities() -> Vec<CapabilityClaim> {
        vec![
            CapabilityClaim {
                feature: "文件路径与容器识别".to_string(),
                stage: CapabilityStage::Identified,
                verified: false,
                evidence: "未接入 libmpv/ffprobe，未对本机文件做过识别实机验证".to_string(),
            },
            CapabilityClaim {
                feature: "视频/音频/字幕流元数据解析".to_string(),
                stage: CapabilityStage::MetadataParsed,
                verified: false,
                evidence: "无 FFmpeg/libmpv 绑定，时长/分辨率/编码/HDR 均未知，未伪造探测结果"
                    .to_string(),
            },
            CapabilityClaim {
                feature: "硬解/软解实际生效".to_string(),
                stage: CapabilityStage::Decoded,
                verified: false,
                evidence: "无解码后端，hwDecoderActive 不得标记为 true".to_string(),
            },
            CapabilityClaim {
                feature: "画面与 ASS/PGS 字幕正确渲染".to_string(),
                stage: CapabilityStage::Rendered,
                verified: false,
                evidence: "原生视频 Surface（D3D11/HWND 嵌入 WebView2）尚未技术验证".to_string(),
            },
            CapabilityClaim {
                feature: "HDR10 / Dolby Vision / 音频直通原生输出".to_string(),
                stage: CapabilityStage::NativeOutput,
                verified: false,
                evidence: "未验证：识别到 HDR 标识不等于具备 HDR 原生输出能力，".to_string()
                    + "未声称任何 Dolby 认证或直通能力",
            },
        ]
    }
}

impl PlayerBackend for MpvBackend {
    fn name(&self) -> &str {
        "mpv (UNVALIDATED / NOT INTEGRATED)"
    }

    fn validated(&self) -> bool {
        false
    }

    fn initialize(&mut self) -> Result<()> {
        Err(Self::integration_error("initialize"))
    }

    fn attach_surface(&mut self, _container_id: &str) -> Result<PlayerSurface> {
        Err(Self::integration_error("attach_surface"))
    }

    fn detach_surface(&mut self) -> Result<()> {
        // 未创建过 Surface，释放本地占位是安全的本地操作，不声称播放成功。
        self.surface = None;
        Ok(())
    }

    fn open(&mut self, _media: &PlayerMediaDescriptor) -> Result<()> {
        Err(Self::integration_error("open"))
    }

    fn command(&mut self, _cmd: &PlayerCommand) -> Result<()> {
        Err(Self::integration_error("command"))
    }

    fn state(&self) -> Result<PlayerState> {
        Ok(self.state.clone())
    }

    fn stats(&self) -> Result<DecodeStats> {
        Ok(DecodeStats::default())
    }

    fn capabilities(&self) -> Vec<CapabilityClaim> {
        Self::unverified_capabilities()
    }

    fn on_state_change(&mut self, listener: StateListener) -> ListenerId {
        let id = self.next_listener_id;
        self.next_listener_id = self.next_listener_id.wrapping_add(1);
        self.state_listeners.push((id, listener));
        id
    }

    fn on_stats(&mut self, listener: StatsListener) -> ListenerId {
        let id = self.next_listener_id;
        self.next_listener_id = self.next_listener_id.wrapping_add(1);
        self.stats_listeners.push((id, listener));
        id
    }

    fn remove_listener(&mut self, id: ListenerId) {
        self.state_listeners.retain(|(i, _)| *i != id);
        self.stats_listeners.retain(|(i, _)| *i != id);
    }

    fn dispose(&mut self) -> Result<()> {
        self.state_listeners.clear();
        self.stats_listeners.clear();
        self.surface = None;
        self.state = PlayerState::default();
        Ok(())
    }
}

// ============================================================
// 单元测试（纯逻辑，可编译）
// ============================================================

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn mpv_backend_is_explicitly_not_validated() {
        let backend = MpvBackend::new();
        assert!(!backend.validated());
        assert!(backend.name().contains("UNVALIDATED"));
    }

    #[test]
    fn all_capabilities_are_unverified_and_cover_five_stages() {
        let caps = MpvBackend::unverified_capabilities();
        assert_eq!(caps.len(), 5);
        assert!(caps.iter().all(|c| !c.verified));
        for stage in [
            CapabilityStage::Identified,
            CapabilityStage::MetadataParsed,
            CapabilityStage::Decoded,
            CapabilityStage::Rendered,
            CapabilityStage::NativeOutput,
        ] {
            assert!(
                caps.iter().any(|c| c.stage == stage),
                "缺少阶段 {:?}",
                stage
            );
        }
    }

    #[test]
    fn playback_operations_never_fake_success() {
        let mut backend = MpvBackend::new();
        assert!(matches!(
            backend.initialize(),
            Err(CoreError::Unvalidated(_))
        ));
        assert!(matches!(
            backend.attach_surface("player-container"),
            Err(CoreError::Unvalidated(_))
        ));
        assert!(matches!(
            backend.open(&PlayerMediaDescriptor {
                media_id: "m1".to_string(),
                version_id: "v1".to_string(),
                uri: "file:///movie.mkv".to_string(),
                start_seconds: None,
                video: None,
                audio: vec![],
                subtitles: vec![],
                chapters: vec![],
            }),
            Err(CoreError::Unvalidated(_))
        ));
        assert!(matches!(
            backend.command(&PlayerCommand::Play),
            Err(CoreError::Unvalidated(_))
        ));
    }

    #[test]
    fn state_and_stats_are_real_idle_not_fabricated() {
        let backend = MpvBackend::new();
        let state = backend.state().unwrap();
        assert_eq!(state.state, PlayerBackendState::Idle);
        assert!(!state.paused || state.state == PlayerBackendState::Idle);
        assert_eq!(state.position_seconds, 0.0);
        let stats = backend.stats().unwrap();
        assert!(!stats.hw_decoder_active, "未解码不得声称硬解生效");
        assert!(stats.video_codec.is_none());
        assert!(stats.output_color_space.is_none());
    }

    #[test]
    fn player_command_serde_matches_typescript_tagged_union() {
        assert_eq!(
            serde_json::to_value(PlayerCommand::Play).unwrap(),
            json!({ "type": "play" })
        );
        assert_eq!(
            serde_json::to_value(PlayerCommand::FrameStep).unwrap(),
            json!({ "type": "frame-step" })
        );
        assert_eq!(
            serde_json::to_value(PlayerCommand::Seek {
                seconds: 12.5,
                exact: Some(true)
            })
            .unwrap(),
            json!({ "type": "seek", "seconds": 12.5, "exact": true })
        );
        // 字幕关闭用 null 表达。
        assert_eq!(
            serde_json::to_value(PlayerCommand::SetSubtitleTrack { index: None }).unwrap(),
            json!({ "type": "set-subtitle-track", "index": null })
        );
        // 往返一致。
        let cmd = PlayerCommand::SetSubtitleDelay { milliseconds: 250 };
        let text = serde_json::to_string(&cmd).unwrap();
        assert_eq!(serde_json::from_str::<PlayerCommand>(&text).unwrap(), cmd);
    }

    #[test]
    fn capability_stage_literals() {
        assert_eq!(
            serde_json::to_value(CapabilityStage::MetadataParsed).unwrap(),
            json!("metadata-parsed")
        );
        assert_eq!(
            serde_json::to_value(CapabilityStage::NativeOutput).unwrap(),
            json!("native-output")
        );
    }

    #[test]
    fn listeners_can_be_registered_and_removed() {
        let mut backend = MpvBackend::new();
        let id = backend.on_state_change(Box::new(|_| {}));
        assert!(id > 0);
        backend.remove_listener(id);
        // dispose 是安全的本地清理，不声称播放成功。
        assert!(backend.dispose().is_ok());
    }
}
