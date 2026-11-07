//! history — 续播进度、播放次数、播放历史
//!
//! - 进度落库到 `playback_history`，同时冗余到 `media.resume_seconds` 便于首页幕墙展示。
//! - 播放次数只在「本次从未完成变为已完成」时 +1，避免重复上报导致计数膨胀。
//! - 是否续播由 `AppSettings.resumeBehaviour` 决定（ask / always / never），
//!   见 [`resume_action`]；Rust 侧只给结论，弹窗交互由前端负责。
//!
//! 本模块源码未经编译验证：Rust 工具链 1.99.1 已安装（未在 PATH），但 MSVC / Windows SDK / link.exe 缺失；不得视为可运行实现。

use crate::database::Database;
use crate::models::{PlaybackProgress, ResumeBehaviour};
use crate::{CoreError, Result};

/// 视为「已看完」的进度比例。
pub const COMPLETION_RATIO: f64 = 0.95;

pub fn is_completed(position_seconds: f64, duration_seconds: f64) -> bool {
    duration_seconds > 0.0 && position_seconds >= duration_seconds * COMPLETION_RATIO
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ResumeAction {
    /// 不续播（无进度 / 已完成 / 用户设为 never）。
    None,
    /// 询问用户是否续播。
    Prompt,
    /// 自动续播。
    Auto,
}

/// 依据设置与已有进度决定续播动作。
/// 已完成、零进度、或接近结尾（>= 95%）都不再提示续播。
pub fn resume_action(
    behaviour: ResumeBehaviour,
    progress: Option<&PlaybackProgress>,
) -> ResumeAction {
    let Some(p) = progress else {
        return ResumeAction::None;
    };
    if p.completed
        || p.position_seconds <= 0.0
        || is_completed(p.position_seconds, p.duration_seconds)
    {
        return ResumeAction::None;
    }
    match behaviour {
        ResumeBehaviour::Never => ResumeAction::None,
        ResumeBehaviour::Always => ResumeAction::Auto,
        ResumeBehaviour::Ask => ResumeAction::Prompt,
    }
}

fn validate_progress(p: &PlaybackProgress) -> Result<()> {
    if p.media_id.is_empty() || p.version_id.is_empty() {
        return Err(CoreError::Config(
            "mediaId / versionId 不可为空".to_string(),
        ));
    }
    if p.position_seconds < 0.0
        || p.duration_seconds < 0.0
        || p.position_seconds > p.duration_seconds
    {
        return Err(CoreError::Config(format!(
            "非法播放进度: position={} duration={}",
            p.position_seconds, p.duration_seconds
        )));
    }
    Ok(())
}

#[derive(Debug, Default, Clone, Copy)]
pub struct HistoryManager;

impl HistoryManager {
    /// 保存（或更新）一条播放进度；必要时递增播放次数。
    pub fn save(&self, db: &Database, progress: &PlaybackProgress) -> Result<()> {
        validate_progress(progress)?;
        let was_completed = db.list_history()?.into_iter().any(|p| {
            p.media_id == progress.media_id && p.version_id == progress.version_id && p.completed
        });
        let mut normalized = progress.clone();
        normalized.completed = progress.completed
            || is_completed(progress.position_seconds, progress.duration_seconds);
        normalized.updated_at = chrono::Utc::now().to_rfc3339();
        db.save_progress(&normalized)?;
        if normalized.completed && !was_completed {
            db.increment_play_count(&normalized.media_id)?;
        }
        Ok(())
    }

    pub fn list(&self, db: &Database) -> Result<Vec<PlaybackProgress>> {
        db.list_history()
    }

    /// 取指定媒体 + 版本的最新续播记录。
    pub fn resume(
        &self,
        db: &Database,
        media_id: &str,
        version_id: &str,
    ) -> Result<Option<PlaybackProgress>> {
        Ok(db
            .list_history()?
            .into_iter()
            .find(|p| p.media_id == media_id && p.version_id == version_id))
    }

    /// 首页幕墙用的续播秒数：取该媒体最近一条未完成进度。
    pub fn resume_seconds(&self, db: &Database, media_id: &str) -> Result<Option<f64>> {
        let mut candidates: Vec<PlaybackProgress> = db
            .list_history()?
            .into_iter()
            .filter(|p| p.media_id == media_id && !p.completed && p.position_seconds > 0.0)
            .collect();
        candidates.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
        Ok(candidates.first().map(|p| p.position_seconds))
    }

    pub fn play_count(&self, db: &Database, media_id: &str) -> Result<i64> {
        Ok(db.get_media(media_id)?.map(|m| m.play_count).unwrap_or(0))
    }
}

// ============================================================
// 单元测试（纯逻辑 + 内存数据库，可编译）
// ============================================================

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{MediaItem, MediaKind, MediaMetadata, MetadataOrigin};

    fn seed_media(db: &Database, id: &str) {
        let item = MediaItem {
            id: id.to_string(),
            kind: MediaKind::Movie,
            metadata: MediaMetadata {
                title: "测试影片".to_string(),
                original_title: None,
                year: None,
                synopsis: None,
                directors: vec![],
                cast: vec![],
                writers: vec![],
                genres: vec![],
                release_date: None,
                rating: None,
                poster_path: None,
                backdrop_path: None,
                season_count: None,
                episode_count: None,
                origin: MetadataOrigin::Local,
                external_ids: None,
                updated_at: None,
            },
            versions: vec![],
            added_at: "2024-01-01T00:00:00+00:00".to_string(),
            updated_at: "2024-01-01T00:00:00+00:00".to_string(),
            favorite: false,
            tags: vec![],
            wall_weight: None,
            resume_seconds: None,
            last_played_at: None,
            play_count: 0,
        };
        db.save_media(&item).unwrap();
    }

    fn progress(media_id: &str, position: f64, duration: f64) -> PlaybackProgress {
        PlaybackProgress {
            media_id: media_id.to_string(),
            version_id: "v1".to_string(),
            position_seconds: position,
            duration_seconds: duration,
            completed: false,
            updated_at: "2024-01-01T00:00:00+00:00".to_string(),
        }
    }

    #[test]
    fn completion_threshold() {
        assert!(!is_completed(50.0, 100.0));
        assert!(is_completed(95.0, 100.0));
        assert!(!is_completed(0.0, 0.0), "零时长不得视为已完成");
    }

    #[test]
    fn resume_action_respects_behaviour_and_completion() {
        let p = progress("m1", 30.0, 100.0);
        assert_eq!(
            resume_action(ResumeBehaviour::Ask, Some(&p)),
            ResumeAction::Prompt
        );
        assert_eq!(
            resume_action(ResumeBehaviour::Always, Some(&p)),
            ResumeAction::Auto
        );
        assert_eq!(
            resume_action(ResumeBehaviour::Never, Some(&p)),
            ResumeAction::None
        );
        assert_eq!(
            resume_action(ResumeBehaviour::Always, None),
            ResumeAction::None
        );

        let completed = progress("m1", 99.0, 100.0);
        assert_eq!(
            resume_action(ResumeBehaviour::Always, Some(&completed)),
            ResumeAction::None
        );
        let zero = progress("m1", 0.0, 100.0);
        assert_eq!(
            resume_action(ResumeBehaviour::Always, Some(&zero)),
            ResumeAction::None
        );
    }

    #[test]
    fn save_rejects_invalid_progress() {
        let db = Database::open_in_memory().unwrap();
        seed_media(&db, "m1");
        let manager = HistoryManager;
        let negative = progress("m1", -1.0, 100.0);
        assert!(manager.save(&db, &negative).is_err());
        let overflow = progress("m1", 200.0, 100.0);
        assert!(manager.save(&db, &overflow).is_err());
        let empty = PlaybackProgress {
            media_id: String::new(),
            ..progress("m1", 1.0, 100.0)
        };
        assert!(manager.save(&db, &empty).is_err());
    }

    #[test]
    fn save_records_progress_and_counts_play_once() {
        let db = Database::open_in_memory().unwrap();
        seed_media(&db, "m1");
        let manager = HistoryManager;

        manager.save(&db, &progress("m1", 30.0, 100.0)).unwrap();
        assert_eq!(manager.list(&db).unwrap().len(), 1);
        assert_eq!(manager.resume_seconds(&db, "m1").unwrap(), Some(30.0));
        assert_eq!(manager.play_count(&db, "m1").unwrap(), 0);

        // 首次达到完成：播放次数 +1。
        manager.save(&db, &progress("m1", 96.0, 100.0)).unwrap();
        assert_eq!(manager.play_count(&db, "m1").unwrap(), 1);
        assert!(manager.resume(&db, "m1", "v1").unwrap().unwrap().completed);

        // 重复上报完成不得重复计数。
        manager.save(&db, &progress("m1", 98.0, 100.0)).unwrap();
        assert_eq!(manager.play_count(&db, "m1").unwrap(), 1);
        assert_eq!(
            manager.resume_seconds(&db, "m1").unwrap(),
            None,
            "已完成后不应再提供续播点"
        );
    }
}
