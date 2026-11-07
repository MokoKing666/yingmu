//! search — FTS5 全文检索与分页

use crate::AppState;
use tauri::State;
use yingmu_core::models::{SearchQuery, SearchResult};

#[tauri::command(rename_all = "camelCase")]
pub fn yingmu_search(
    query: SearchQuery,
    state: State<'_, AppState>,
) -> Result<SearchResult, String> {
    let db = state.db()?;
    db.search(&query).map_err(|e| e.to_string())
}
