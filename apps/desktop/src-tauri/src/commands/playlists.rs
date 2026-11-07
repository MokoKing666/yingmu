//! playlist* — 播放列表读取 / 保存 / 删除
//!
//! 契约已对齐：`IPC.playlistRemove = 'yingmu_playlist_remove'` 由架构师补充，
//! 对应 `PlatformBridge.playlistRemove(id)`。三条命令全部实现并注册。

use crate::AppState;
use tauri::State;
use yingmu_core::models::Playlist;

#[tauri::command(rename_all = "camelCase")]
pub fn yingmu_playlist_list(state: State<'_, AppState>) -> Result<Vec<Playlist>, String> {
    let db = state.db()?;
    db.list_playlists().map_err(|e| e.to_string())
}

#[tauri::command(rename_all = "camelCase")]
pub fn yingmu_playlist_save(playlist: Playlist, state: State<'_, AppState>) -> Result<(), String> {
    let db = state.db()?;
    db.save_playlist(&playlist).map_err(|e| e.to_string())
}

/// 删除播放列表；`id` 不存在时 `Database::remove_playlist` 为幂等成功（DELETE 影响 0 行）。
#[tauri::command(rename_all = "camelCase")]
pub fn yingmu_playlist_remove(id: String, state: State<'_, AppState>) -> Result<(), String> {
    let db = state.db()?;
    db.remove_playlist(&id).map_err(|e| e.to_string())
}
