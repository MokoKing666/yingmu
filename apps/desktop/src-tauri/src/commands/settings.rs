//! settings* — 应用设置读取与局部更新（持久化到用户数据目录）

use crate::{AppSettingsPatch, AppState};
use tauri::State;
use yingmu_core::models::AppSettings;

#[tauri::command(rename_all = "camelCase")]
pub fn yingmu_settings_get(state: State<'_, AppState>) -> Result<AppSettings, String> {
    state.settings()
}

#[tauri::command(rename_all = "camelCase")]
pub fn yingmu_settings_set(
    patch: AppSettingsPatch,
    state: State<'_, AppState>,
) -> Result<AppSettings, String> {
    state.update_settings(&patch)
}
