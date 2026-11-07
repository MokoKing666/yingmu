//! library* — 媒体库读取与元数据/收藏/版本

use crate::AppState;
use tauri::State;
use yingmu_core::database::parse_media_kind;
use yingmu_core::metadata::{apply_manual_override, MetadataPatch};
use yingmu_core::models::{MediaItem, MediaVersion};

#[tauri::command(rename_all = "camelCase")]
pub fn yingmu_library_list(
    kind: Option<String>,
    state: State<'_, AppState>,
) -> Result<Vec<MediaItem>, String> {
    let db = state.db()?;
    db.list_media(kind.as_deref().map(parse_media_kind))
        .map_err(|e| e.to_string())
}

#[tauri::command(rename_all = "camelCase")]
pub fn yingmu_library_get(
    id: String,
    state: State<'_, AppState>,
) -> Result<Option<MediaItem>, String> {
    let db = state.db()?;
    db.get_media(&id).map_err(|e| e.to_string())
}

#[tauri::command(rename_all = "camelCase")]
pub fn yingmu_library_update_metadata(
    id: String,
    patch: MetadataPatch,
    state: State<'_, AppState>,
) -> Result<MediaItem, String> {
    let db = state.db()?;
    let current = db
        .get_media(&id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("媒体不存在: {}", id))?;
    // 手动修正：origin 置为 Manual，未提供的字段保留（不覆盖原始信息）。
    let merged = apply_manual_override(&current.metadata, &patch);
    db.update_media_metadata(&id, &merged)
        .map_err(|e| e.to_string())?;
    db.get_media(&id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("更新后无法读取媒体: {}", id))
}

#[tauri::command(rename_all = "camelCase")]
pub fn yingmu_library_set_favorite(
    id: String,
    favorite: bool,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let db = state.db()?;
    db.set_favorite(&id, favorite).map_err(|e| e.to_string())
}

#[tauri::command(rename_all = "camelCase")]
pub fn yingmu_library_versions(
    id: String,
    state: State<'_, AppState>,
) -> Result<Vec<MediaVersion>, String> {
    let db = state.db()?;
    db.media_versions(&id).map_err(|e| e.to_string())
}
