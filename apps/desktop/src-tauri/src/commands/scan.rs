//! scan* — 启动 / 取消 / 查询扫描
//!
//! 真实调用 `scanner::Scanner`：递归扫描、部分内容指纹、去重、增量决策、
//! 断点恢复、删除/移动检测均走核心模块。发现的媒体会写入数据库，
//! 但**不伪造**任何媒体探测结果（时长/分辨率/编码/HDR 全部留空）。

use crate::AppState;
use std::collections::HashMap;
use tauri::State;
use yingmu_core::database::derive_media_id;
use yingmu_core::models::{
    MediaItem, MediaKind, MediaMetadata, MediaVersion, MetadataOrigin, ScanProgress, ScanState,
};
use yingmu_core::scanner::{CancelToken, FileStamp, ScanCursor, ScanEvent, Scanner};

/// 从相对路径取「文件名去扩展名」作为兜底标题；不解析任何媒体内容。
fn filename_title(relative_path: &str) -> String {
    let name = relative_path.rsplit('/').next().unwrap_or(relative_path);
    match name.rsplit_once('.') {
        Some((stem, _)) if !stem.is_empty() => stem.to_string(),
        _ => name.to_string(),
    }
}

#[tauri::command(rename_all = "camelCase")]
pub fn yingmu_scan_start(id: String, state: State<'_, AppState>) -> Result<(), String> {
    // 先取 provider（克隆 Arc 后释放锁）。
    let provider = {
        let registry = state.providers.lock().map_err(|e| e.to_string())?;
        registry.get(&id)
    }
    .ok_or_else(|| format!("源未注册，无法扫描: {}", id))?;

    let token = CancelToken::new();
    state
        .scan_tokens
        .lock()
        .map_err(|e| e.to_string())?
        .insert(id.clone(), token.clone());

    // 加载库中已有版本戳（增量 / 删除检测）与断点游标。
    let stamps: HashMap<String, FileStamp> = {
        let db = state.db()?;
        db.version_stamps(&id)
            .map_err(|e| e.to_string())?
            .into_iter()
            .map(|row| {
                (
                    row.relative_path,
                    FileStamp {
                        size_bytes: row.size_bytes as u64,
                        modified_at: Some(row.modified_at),
                        fingerprint: Some(row.fingerprint),
                    },
                )
            })
            .collect()
    };
    let cursor: Option<ScanCursor> = {
        let db = state.db()?;
        db.get_source(&id)
            .map_err(|e| e.to_string())?
            .and_then(|s| s.scan_cursor)
            .and_then(|raw| ScanCursor::decode(&raw).ok())
    };

    // 同步执行扫描（Tauri 同步 command 运行在 IPC 工作线程，不阻塞 UI 线程）。
    let scanner = Scanner::new(token.clone());
    let mut events: Vec<ScanEvent> = Vec::new();
    let mut sink = |event| events.push(event);
    let progress = scanner
        .scan(provider.as_ref(), &id, &stamps, cursor.as_ref(), &mut sink)
        .map_err(|e| e.to_string())?;

    // 处理发现事件：入库（已存在则只补版本，绝不覆盖用户已修正的元数据）。
    let mut last_path: Option<String> = None;
    {
        let db = state.db()?;
        for event in &events {
            if let ScanEvent::FileDiscovered {
                relative_path,
                fingerprint,
            } = event
            {
                last_path = Some(relative_path.clone());
                let fp_key = fingerprint.as_key();
                let media_id = db
                    .find_media_id_by_fingerprint(&fp_key)
                    .map_err(|e| e.to_string())?
                    .unwrap_or_else(|| derive_media_id(&fp_key));
                let now = chrono::Utc::now().to_rfc3339();
                let version = MediaVersion {
                    id: derive_media_id(&format!("version|{}|{}", id, relative_path)),
                    media_id: media_id.clone(),
                    source_id: id.clone(),
                    relative_path: relative_path.clone(),
                    fingerprint: fp_key,
                    size_bytes: fingerprint.size_bytes as i64,
                    modified_at: now.clone(),
                    // 无 FFmpeg/libmpv 绑定：以下技术信息一律留空，绝不伪造探测结果。
                    duration_seconds: None,
                    container: None,
                    video: None,
                    audio: vec![],
                    subtitles: vec![],
                    chapters: vec![],
                    label: "默认".to_string(),
                    is_default: Some(true),
                };
                if db
                    .get_media(&media_id)
                    .map_err(|e| e.to_string())?
                    .is_none()
                {
                    let item = MediaItem {
                        id: media_id,
                        // 分类未探测，取默认占位；不代表已完成类型识别。
                        kind: MediaKind::Movie,
                        metadata: MediaMetadata {
                            title: filename_title(relative_path),
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
                        versions: vec![version],
                        added_at: now.clone(),
                        updated_at: now,
                        favorite: false,
                        tags: vec![],
                        wall_weight: None,
                        resume_seconds: None,
                        last_played_at: None,
                        play_count: 0,
                    };
                    db.save_media(&item).map_err(|e| e.to_string())?;
                } else {
                    db.upsert_version(&version).map_err(|e| e.to_string())?;
                }
            }
        }
    }

    // 未取消时推进断点游标；取消则保留旧游标供续扫。
    if !token.is_cancelled() {
        let cursor = ScanCursor {
            last_relative_path: last_path.unwrap_or_default(),
            scanned: progress.scanned,
        };
        let encoded = cursor.encode().map_err(|e| e.to_string())?;
        let db = state.db()?;
        db.update_scan_cursor(&id, Some(encoded.as_str()))
            .map_err(|e| e.to_string())?;
    }

    state
        .scan_progress
        .lock()
        .map_err(|e| e.to_string())?
        .insert(id, progress);
    Ok(())
}

#[tauri::command(rename_all = "camelCase")]
pub fn yingmu_scan_cancel(id: String, state: State<'_, AppState>) -> Result<(), String> {
    let tokens = state.scan_tokens.lock().map_err(|e| e.to_string())?;
    match tokens.get(&id) {
        Some(token) => {
            token.cancel();
            Ok(())
        }
        None => Err(format!("没有进行中的扫描任务: {}", id)),
    }
}

#[tauri::command(rename_all = "camelCase")]
pub fn yingmu_scan_status(id: String, state: State<'_, AppState>) -> Result<ScanProgress, String> {
    let fallback = ScanProgress {
        source_id: id.clone(),
        state: ScanState::Idle,
        scanned: 0,
        discovered: 0,
        duplicates: 0,
        removed: 0,
        current_path: None,
        started_at: None,
        cancellable: false,
    };
    Ok(state
        .scan_progress
        .lock()
        .map_err(|e| e.to_string())?
        .get(&id)
        .cloned()
        .unwrap_or(fallback))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn filename_title_strips_extension_and_directory() {
        assert_eq!(
            filename_title("Movies/Inception.2010.mkv"),
            "Inception.2010"
        );
        assert_eq!(filename_title("a/b/c.mp4"), "c");
        assert_eq!(filename_title("无扩展名"), "无扩展名");
        assert_eq!(filename_title(".hidden"), ".hidden");
    }
}
