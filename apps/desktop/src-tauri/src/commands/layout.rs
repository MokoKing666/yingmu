//! layout* — 布局偏好（排序模式 + 自定义排列）的读写
//!
//! 与 WebDemoBridge 的 localStorage 实现语义一致，但真正落 SQLite
//! （`layout_preferences` 表，迁移 003）。禁止用 localStorage 冒充桌面端持久化。

use crate::AppState;
use tauri::State;
use yingmu_core::models::LayoutPreferences;

/// 读取某个作用域的布局偏好；没有记录时返回该作用域的正式默认值
/// （home=recommended，其余=recent，与前端 defaultSortFor 一致）。
#[tauri::command(rename_all = "camelCase")]
pub fn yingmu_layout_get(
    scope: String,
    state: State<'_, AppState>,
) -> Result<LayoutPreferences, String> {
    let db = state.db()?;
    let existing = db.layout_get(&scope).map_err(|e| e.to_string())?;
    Ok(existing.unwrap_or_else(|| LayoutPreferences::default_for(&scope)))
}

/// 写入某个作用域的布局偏好。实现方负责过滤失效 Media ID 与事务写入。
#[tauri::command(rename_all = "camelCase")]
pub fn yingmu_layout_set(
    scope: String,
    preferences: LayoutPreferences,
    state: State<'_, AppState>,
) -> Result<(), String> {
    if preferences.scope != scope {
        return Err(format!(
            "布局偏好作用域不一致：参数 scope={}，载荷 scope={}",
            scope, preferences.scope
        ));
    }
    let db = state.db()?;
    db.layout_set(&preferences).map_err(|e| e.to_string())
}
