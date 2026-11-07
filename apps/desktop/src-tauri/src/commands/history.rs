//! history* — 播放历史读取与进度保存

use crate::AppState;
use tauri::State;
use yingmu_core::history::HistoryManager;
use yingmu_core::models::PlaybackProgress;

#[tauri::command(rename_all = "camelCase")]
pub fn yingmu_history_list(state: State<'_, AppState>) -> Result<Vec<PlaybackProgress>, String> {
    let db = state.db()?;
    HistoryManager::default()
        .list(&db)
        .map_err(|e| e.to_string())
}

#[tauri::command(rename_all = "camelCase")]
pub fn yingmu_history_save(
    progress: PlaybackProgress,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let db = state.db()?;
    HistoryManager::default()
        .save(&db, &progress)
        .map_err(|e| e.to_string())
}
