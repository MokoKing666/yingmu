//! subtitles — SRT / ASS / SSA / PGS / VobSub / WebVTT 轨道管理
//!
//! # 强制约束：禁止降级为纯文本
//! - ASS / SSA 含特效、PGS / VobSub 是图片字幕，`requires_native_rendering` 必须为
//!   `true`，**必须保留原始渲染路径**；[`parse_external`] 对这四类格式直接返回明确错误，
//!   绝不把它们当纯文本字幕解析。
//! - SRT / WebVTT 是纯文本格式，可解析为文本 cue；其余未知格式返回明确错误，不猜测。
//! - 内封轨道与外挂轨道分别管理（`external` 标记），外挂可设置延迟。
//!
//! 本模块源码未经编译验证：本地已具备 Rust 与便携 MSVC/Windows SDK 工具链，但受构建环境限制尚未完成完整编译与测试；不得视为可运行实现。

use crate::models::{SubtitleFormat, SubtitleStreamInfo};
use crate::{CoreError, Result};
use serde::{Deserialize, Serialize};

/// 字幕轨道（比 `SubtitleStreamInfo` 多外挂路径、延迟与原生渲染标记）。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubtitleTrack {
    pub index: i64,
    pub format: SubtitleFormat,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub language: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    /// 外挂字幕为 true；内封为 false。
    pub external: bool,
    /// 外挂字幕的 URI / 路径（由平台层解析，前端不接触本地绝对路径语义）。
    #[serde(skip_serializing_if = "Option::is_none")]
    pub uri: Option<String>,
    pub delay_ms: i64,
    /// ASS 特效 / PGS 图片字幕必须为 true，禁止降级为纯文本。
    pub requires_native_rendering: bool,
}

/// 按扩展名识别字幕格式。
/// VobSub 通常由 `.idx` + `.sub` 成对构成；`.sup` 为 PGS 图片字幕流。
pub fn detect_format(name_or_uri: &str) -> SubtitleFormat {
    let lower = name_or_uri.to_ascii_lowercase();
    let ext = lower.rsplit('.').next().unwrap_or("");
    match ext {
        "srt" => SubtitleFormat::Srt,
        "ass" => SubtitleFormat::Ass,
        "ssa" => SubtitleFormat::Ssa,
        "pgs" | "sup" => SubtitleFormat::Pgs,
        "vobsub" | "idx" | "sub" => SubtitleFormat::Vobsub,
        "vtt" | "webvtt" => SubtitleFormat::Webvtt,
        _ => SubtitleFormat::Other,
    }
}

/// 是否需要原生渲染：ASS/SSA 特效、PGS/VobSub 图片字幕均不可降级为纯文本。
pub fn requires_native_rendering(format: SubtitleFormat) -> bool {
    matches!(
        format,
        SubtitleFormat::Ass | SubtitleFormat::Ssa | SubtitleFormat::Pgs | SubtitleFormat::Vobsub
    )
}

/// 纯文本字幕 cue。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubtitleCue {
    pub index: i64,
    pub start_ms: i64,
    pub end_ms: i64,
    pub text: String,
}

/// 解析时间码，支持 `HH:MM:SS,mmm` / `HH:MM:SS.mmm` / `MM:SS.mmm`，返回毫秒。
fn parse_timestamp(raw: &str) -> Option<i64> {
    let s = raw.trim().replace(',', ".");
    let parts: Vec<&str> = s.split(':').collect();
    let (hours, minutes, rest) = match parts.len() {
        3 => (
            parts[0].parse::<i64>().ok()?,
            parts[1].parse::<i64>().ok()?,
            parts[2],
        ),
        2 => (0, parts[0].parse::<i64>().ok()?, parts[1]),
        _ => return None,
    };
    let sec_parts: Vec<&str> = rest.split('.').collect();
    let seconds = sec_parts[0].parse::<i64>().ok()?;
    let millis = if sec_parts.len() > 1 {
        let frac = &sec_parts[1][..sec_parts[1].len().min(3)];
        format!("{:0<3}", frac).parse::<i64>().ok()?
    } else {
        0
    };
    Some((hours * 3600 + minutes * 60 + seconds) * 1000 + millis)
}

fn parse_time_range(line: &str) -> Result<(i64, i64)> {
    let mut halves = line.split("-->");
    let start_raw = halves
        .next()
        .ok_or_else(|| CoreError::Config("时间行缺少起始时间".to_string()))?;
    let end_raw = halves
        .next()
        .ok_or_else(|| CoreError::Config("时间行缺少 '-->'".to_string()))?;
    // WebVTT 时间行尾部可能带 align:/position: 等设置，只取第一个 token。
    let end_token = end_raw.split_whitespace().next().unwrap_or(end_raw);
    let start = parse_timestamp(start_raw)
        .ok_or_else(|| CoreError::Config("起始时间码解析失败".to_string()))?;
    let end = parse_timestamp(end_token)
        .ok_or_else(|| CoreError::Config("结束时间码解析失败".to_string()))?;
    Ok((start, end))
}

/// 解析 SRT 纯文本字幕。
pub fn parse_srt(content: &str) -> Result<Vec<SubtitleCue>> {
    let normalized = content.replace("\r\n", "\n");
    let mut cues = Vec::new();
    for block in normalized.split("\n\n") {
        let block = block.trim();
        if block.is_empty() {
            continue;
        }
        let mut lines = block.lines();
        let _sequence = lines.next(); // 序号行
        let time_line = lines
            .next()
            .ok_or_else(|| CoreError::Config("SRT 块缺少时间行".to_string()))?;
        let (start_ms, end_ms) = parse_time_range(time_line)?;
        let text = lines.collect::<Vec<_>>().join("\n");
        cues.push(SubtitleCue {
            index: cues.len() as i64,
            start_ms,
            end_ms,
            text,
        });
    }
    Ok(cues)
}

/// 解析 WebVTT 纯文本字幕（忽略 NOTE/STYLE 等不含 "-->" 的块）。
pub fn parse_webvtt(content: &str) -> Result<Vec<SubtitleCue>> {
    let normalized = content.replace("\r\n", "\n");
    let mut cues = Vec::new();
    for block in normalized.split("\n\n") {
        let block = block.trim();
        if !block.contains("-->") {
            continue;
        }
        let lines: Vec<&str> = block.lines().collect();
        let time_line = lines
            .iter()
            .find(|l| l.contains("-->"))
            .copied()
            .ok_or_else(|| CoreError::Config("WebVTT 块缺少时间行".to_string()))?;
        let (start_ms, end_ms) = parse_time_range(time_line)?;
        let text = lines
            .iter()
            .skip_while(|l| !l.contains("-->"))
            .skip(1)
            .copied()
            .collect::<Vec<_>>()
            .join("\n");
        cues.push(SubtitleCue {
            index: cues.len() as i64,
            start_ms,
            end_ms,
            text,
        });
    }
    Ok(cues)
}

/// 加载外挂字幕文本。
///
/// 对 ASS/SSA/PGS/VobSub **直接返回明确错误**：这些格式必须走原生渲染路径，
/// 禁止降级为纯文本；未知格式同样拒绝，不猜测、不伪造。
pub fn parse_external(uri: &str, content: &str) -> Result<Vec<SubtitleCue>> {
    match detect_format(uri) {
        SubtitleFormat::Srt => parse_srt(content),
        SubtitleFormat::Webvtt => parse_webvtt(content),
        SubtitleFormat::Ass
        | SubtitleFormat::Ssa
        | SubtitleFormat::Pgs
        | SubtitleFormat::Vobsub => Err(CoreError::Config(
            "ASS/SSA 特效字幕与 PGS/VobSub 图片字幕必须保留原生渲染路径，禁止降级为纯文本"
                .to_string(),
        )),
        SubtitleFormat::Other => Err(CoreError::Config(format!(
            "无法识别的外挂字幕格式: {}",
            uri
        ))),
    }
}

/// 对纯文本 cue 应用字幕延迟（毫秒）；起始时间不会变成负数。
pub fn apply_delay(cues: &[SubtitleCue], delay_ms: i64) -> Vec<SubtitleCue> {
    cues.iter()
        .map(|cue| SubtitleCue {
            start_ms: (cue.start_ms + delay_ms).max(0),
            end_ms: (cue.end_ms + delay_ms).max(0),
            ..cue.clone()
        })
        .collect()
}

// ============================================================
// 轨道管理
// ============================================================

#[derive(Debug, Default)]
pub struct SubtitleTrackManager {
    tracks: Vec<SubtitleTrack>,
    next_index: i64,
}

impl SubtitleTrackManager {
    pub fn new() -> Self {
        SubtitleTrackManager {
            tracks: Vec::new(),
            next_index: 0,
        }
    }

    /// 从媒体文件内封轨道构造（无任何外挂/延迟）。
    pub fn from_streams(streams: &[SubtitleStreamInfo]) -> Self {
        let mut manager = SubtitleTrackManager::new();
        for stream in streams {
            manager.tracks.push(SubtitleTrack {
                index: stream.index,
                format: stream.format,
                language: stream.language.clone(),
                title: stream.title.clone(),
                external: stream.external.unwrap_or(false),
                uri: None,
                delay_ms: 0,
                // 已有标记优先；否则按格式推断，确保 ASS/PGS 不被漏标。
                requires_native_rendering: stream
                    .requires_native_rendering
                    .unwrap_or_else(|| requires_native_rendering(stream.format)),
            });
            manager.next_index = manager.next_index.max(stream.index + 1);
        }
        manager
    }

    /// 加载一个外挂字幕；未知格式返回明确错误。
    pub fn add_external(&mut self, uri: &str, language: Option<String>) -> Result<SubtitleTrack> {
        let format = detect_format(uri);
        if format == SubtitleFormat::Other {
            return Err(CoreError::Config(format!(
                "无法识别的外挂字幕格式: {}",
                uri
            )));
        }
        let track = SubtitleTrack {
            index: self.next_index,
            format,
            language,
            title: None,
            external: true,
            uri: Some(uri.to_string()),
            delay_ms: 0,
            requires_native_rendering: requires_native_rendering(format),
        };
        self.next_index += 1;
        self.tracks.push(track.clone());
        Ok(track)
    }

    /// 设置某轨道的字幕延迟。
    pub fn set_delay(&mut self, index: i64, delay_ms: i64) -> Result<()> {
        let track = self
            .tracks
            .iter_mut()
            .find(|t| t.index == index)
            .ok_or_else(|| CoreError::NotFound(format!("字幕轨道不存在: {}", index)))?;
        track.delay_ms = delay_ms;
        Ok(())
    }

    pub fn select(&self, index: Option<i64>) -> Option<&SubtitleTrack> {
        let index = index?;
        self.tracks.iter().find(|t| t.index == index)
    }

    pub fn tracks(&self) -> &[SubtitleTrack] {
        &self.tracks
    }

    /// 返回所有必须走原生渲染的轨道（供播放器检查，避免被当作文本处理）。
    pub fn native_render_tracks(&self) -> Vec<&SubtitleTrack> {
        self.tracks
            .iter()
            .filter(|t| t.requires_native_rendering)
            .collect()
    }

    /// 转回共享模型；`requiresNativeRendering` 标记原样保留，绝不丢失。
    pub fn to_stream_infos(&self) -> Vec<SubtitleStreamInfo> {
        self.tracks
            .iter()
            .map(|t| SubtitleStreamInfo {
                index: t.index,
                format: t.format,
                language: t.language.clone(),
                title: t.title.clone(),
                external: Some(t.external),
                requires_native_rendering: Some(t.requires_native_rendering),
            })
            .collect()
    }
}

// ============================================================
// 单元测试（纯逻辑，可编译）
// ============================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detect_format_by_extension() {
        assert_eq!(detect_format("movie.zh.srt"), SubtitleFormat::Srt);
        assert_eq!(detect_format("movie.ass"), SubtitleFormat::Ass);
        assert_eq!(detect_format("movie.SSA"), SubtitleFormat::Ssa);
        assert_eq!(detect_format("movie.sup"), SubtitleFormat::Pgs);
        assert_eq!(detect_format("movie.idx"), SubtitleFormat::Vobsub);
        assert_eq!(detect_format("movie.sub"), SubtitleFormat::Vobsub);
        assert_eq!(detect_format("movie.vtt"), SubtitleFormat::Webvtt);
        assert_eq!(detect_format("movie.webvtt"), SubtitleFormat::Webvtt);
        assert_eq!(detect_format("movie.txt"), SubtitleFormat::Other);
    }

    #[test]
    fn native_rendering_required_for_effects_and_image_subtitles() {
        assert!(requires_native_rendering(SubtitleFormat::Ass));
        assert!(requires_native_rendering(SubtitleFormat::Ssa));
        assert!(requires_native_rendering(SubtitleFormat::Pgs));
        assert!(requires_native_rendering(SubtitleFormat::Vobsub));
        assert!(!requires_native_rendering(SubtitleFormat::Srt));
        assert!(!requires_native_rendering(SubtitleFormat::Webvtt));
        assert!(!requires_native_rendering(SubtitleFormat::Other));
    }

    #[test]
    fn parse_srt_cues() {
        let content =
            "1\n00:00:01,000 --> 00:00:04,000\n第一行\n\n2\n00:01:05,500 --> 00:01:07,250\n第二行";
        let cues = parse_srt(content).unwrap();
        assert_eq!(cues.len(), 2);
        assert_eq!(cues[0].start_ms, 1000);
        assert_eq!(cues[0].end_ms, 4000);
        assert_eq!(cues[0].text, "第一行");
        assert_eq!(cues[1].start_ms, 65_500);
        assert_eq!(cues[1].end_ms, 67_250);
    }

    #[test]
    fn parse_webvtt_cues_and_ignore_header() {
        let content = "WEBVTT\n\nNOTE 这是一条注释\n\n00:00:01.000 --> 00:00:04.000\nHello\n\n00:00:05.000 --> 00:00:07.000 align:start\nWorld";
        let cues = parse_webvtt(content).unwrap();
        assert_eq!(cues.len(), 2);
        assert_eq!(cues[0].start_ms, 1000);
        assert_eq!(cues[1].text, "World");
        // WebVTT 允许省略小时位。
        assert_eq!(parse_timestamp("01:02.500"), Some(62_500));
    }

    #[test]
    fn parse_external_refuses_to_downgrade_special_formats() {
        for uri in ["a.ass", "a.ssa", "a.sup", "a.idx"] {
            let err = parse_external(uri, "whatever").unwrap_err();
            assert!(
                matches!(err, CoreError::Config(_)),
                "{} 必须返回明确错误而非当作纯文本",
                uri
            );
        }
        assert!(parse_external("a.srt", "1\n00:00:01,000 --> 00:00:02,000\nHi").is_ok());
        assert!(parse_external("a.unknown", "x").is_err());
    }

    #[test]
    fn apply_delay_never_goes_negative() {
        let cues = vec![SubtitleCue {
            index: 0,
            start_ms: 1000,
            end_ms: 2000,
            text: "x".to_string(),
        }];
        let delayed = apply_delay(&cues, 250);
        assert_eq!(delayed[0].start_ms, 1250);
        assert_eq!(delayed[0].end_ms, 2250);
        let early = apply_delay(&cues, -5000);
        assert_eq!(early[0].start_ms, 0);
        assert_eq!(early[0].end_ms, 0);
    }

    #[test]
    fn track_manager_marks_external_and_preserves_native_rendering() {
        let mut manager = SubtitleTrackManager::new();
        let ass = manager
            .add_external("sub/effects.ass", Some("zh".to_string()))
            .unwrap();
        assert!(ass.external);
        assert!(ass.requires_native_rendering);
        let srt = manager.add_external("sub/plain.srt", None).unwrap();
        assert!(!srt.requires_native_rendering);

        manager.set_delay(srt.index, 300).unwrap();
        assert_eq!(manager.select(Some(srt.index)).unwrap().delay_ms, 300);
        assert!(manager.select(Some(999)).is_none());
        assert!(manager.set_delay(999, 0).is_err());
        assert_eq!(manager.native_render_tracks().len(), 1);

        // 转回模型后标记不丢失。
        let infos = manager.to_stream_infos();
        assert_eq!(infos.len(), 2);
        assert_eq!(infos[0].requires_native_rendering, Some(true));
        assert_eq!(infos[0].external, Some(true));
        assert_eq!(infos[1].requires_native_rendering, Some(false));
    }

    #[test]
    fn from_streams_respects_existing_flags_and_infers_missing() {
        let streams = vec![
            SubtitleStreamInfo {
                index: 0,
                format: SubtitleFormat::Pgs,
                language: None,
                title: None,
                external: Some(false),
                requires_native_rendering: None, // 缺失时应按格式推断
            },
            SubtitleStreamInfo {
                index: 1,
                format: SubtitleFormat::Srt,
                language: None,
                title: None,
                external: Some(false),
                requires_native_rendering: Some(true), // 显式标记优先
            },
        ];
        let manager = SubtitleTrackManager::from_streams(&streams);
        let tracks = manager.tracks();
        assert!(
            tracks[0].requires_native_rendering,
            "PGS 必须被推断为原生渲染"
        );
        assert!(tracks[1].requires_native_rendering, "已有标记必须被尊重");
        assert_eq!(tracks.len(), 2);
    }
}
