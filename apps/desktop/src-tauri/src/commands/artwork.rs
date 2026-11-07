//! artwork* — 封面读取与缓存重建

use crate::AppState;
use tauri::State;
use yingmu_core::models::ArtworkRequest;

#[tauri::command(rename_all = "camelCase")]
pub fn yingmu_artwork_get(
    req: ArtworkRequest,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let db = state.db()?;
    match state.artwork.get(&db, &req).map_err(|e| e.to_string())? {
        Some(cached) => Ok(cached.path),
        // 在线加载器尚未注入：如实报错，绝不返回伪造路径或占位图片。
        None => Err("封面未缓存：在线加载器尚未注入（未验证），无法获取图片；\
             可先执行 artworkRebuild，或等待平台层封面加载器集成"
            .to_string()),
    }
}

#[tauri::command(rename_all = "camelCase")]
pub fn yingmu_artwork_rebuild(state: State<'_, AppState>) -> Result<(), String> {
    let db = state.db()?;
    state.artwork.rebuild(&db).map_err(|e| e.to_string())?;
    Ok(())
}
