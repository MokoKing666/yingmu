//! player* — 播放器命令
//!
//! libmpv 尚未集成：`open` / `control` / `attachSurface` 会由 `MpvBackend` 返回
//! 明确的「未验证」错误；`state()` 只返回真实的初始 Idle 状态，绝不假成功。

use crate::AppState;
use tauri::State;
use yingmu_core::player::{
    PlayerBackend, PlayerCommand, PlayerMediaDescriptor, PlayerState, PlayerSurface,
};

#[tauri::command(rename_all = "camelCase")]
pub fn yingmu_player_open(
    descriptor: PlayerMediaDescriptor,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let mut backend = state.player.lock().map_err(|e| e.to_string())?;
    backend.open(&descriptor).map_err(|e| e.to_string())
}

#[tauri::command(rename_all = "camelCase")]
pub fn yingmu_player_control(
    command: PlayerCommand,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let mut backend = state.player.lock().map_err(|e| e.to_string())?;
    backend.command(&command).map_err(|e| e.to_string())
}

#[tauri::command(rename_all = "camelCase")]
pub fn yingmu_player_state(state: State<'_, AppState>) -> Result<PlayerState, String> {
    let backend = state.player.lock().map_err(|e| e.to_string())?;
    backend.state().map_err(|e| e.to_string())
}

#[tauri::command(rename_all = "camelCase")]
pub fn yingmu_player_attach_surface(
    container_id: String,
    state: State<'_, AppState>,
) -> Result<PlayerSurface, String> {
    let mut backend = state.player.lock().map_err(|e| e.to_string())?;
    backend
        .attach_surface(&container_id)
        .map_err(|e| e.to_string())
}
