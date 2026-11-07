//! source* — 媒体源增删/列举/连通性测试

use crate::{register_provider, AppState};
use serde::{Deserialize, Serialize};
use tauri::State;
use yingmu_core::database::derive_media_id;
use yingmu_core::models::{MediaKind, MediaSource, SourceProtocol, SourceStatus};
use yingmu_core::network::Connectivity;

/// `sourceAdd` 入参：对应 `Omit<MediaSource, 'id' | 'status' | 'itemCount'>`。
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewSource {
    pub name: String,
    pub protocol: SourceProtocol,
    pub uri: String,
    pub kinds: Vec<MediaKind>,
    pub enabled: bool,
    pub last_scan_at: Option<String>,
    pub scan_cursor: Option<String>,
    pub requires_auth: bool,
}

/// `sourceTest` 返回：只回连通性结论，绝不回传凭据。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceTestResult {
    pub ok: bool,
    pub message: String,
}

#[tauri::command(rename_all = "camelCase")]
pub fn yingmu_source_list(state: State<'_, AppState>) -> Result<Vec<MediaSource>, String> {
    let db = state.db()?;
    db.list_sources().map_err(|e| e.to_string())
}

#[tauri::command(rename_all = "camelCase")]
pub fn yingmu_source_add(
    source: NewSource,
    state: State<'_, AppState>,
) -> Result<MediaSource, String> {
    // 稳定 ID 由 name + uri 派生，不含凭据、不含路径语义。
    let id = derive_media_id(&format!("source|{}|{}", source.name, source.uri));
    let full = MediaSource {
        id: id.clone(),
        name: source.name,
        protocol: source.protocol,
        uri: source.uri,
        status: SourceStatus::Disconnected,
        kinds: source.kinds,
        enabled: source.enabled,
        last_scan_at: source.last_scan_at,
        item_count: 0,
        scan_cursor: source.scan_cursor,
        requires_auth: source.requires_auth,
    };
    {
        let db = state.db()?;
        db.upsert_source(&full).map_err(|e| e.to_string())?;
    }
    let mut registry = state.providers.lock().map_err(|e| e.to_string())?;
    register_provider(&mut registry, &full);
    Ok(full)
}

#[tauri::command(rename_all = "camelCase")]
pub fn yingmu_source_remove(id: String, state: State<'_, AppState>) -> Result<(), String> {
    {
        let db = state.db()?;
        db.remove_source(&id).map_err(|e| e.to_string())?;
    }
    let mut registry = state.providers.lock().map_err(|e| e.to_string())?;
    let _ = registry.remove(&id);
    state.connections.mark_disconnected(&id);
    Ok(())
}

#[tauri::command(rename_all = "camelCase")]
pub fn yingmu_source_test(
    id: String,
    state: State<'_, AppState>,
) -> Result<SourceTestResult, String> {
    // 先克隆 Arc 再释放注册表锁，避免与 source_add 形成 db/providers 反向加锁死锁。
    let provider = {
        let registry = state.providers.lock().map_err(|e| e.to_string())?;
        registry.get(&id)
    };
    let connectivity: Connectivity = match &provider {
        Some(p) => state.connections.test_with_retry(p.as_ref()),
        None => Connectivity {
            ok: false,
            message: format!("源未注册，无法测试连通性: {}", id),
            latency_ms: None,
        },
    };
    // 把连通性结论回写到源状态（不回传任何凭据）。
    {
        let db = state.db()?;
        if let Some(mut source) = db.get_source(&id).map_err(|e| e.to_string())? {
            source.status = if connectivity.ok {
                SourceStatus::Connected
            } else {
                SourceStatus::Disconnected
            };
            db.upsert_source(&source).map_err(|e| e.to_string())?;
        }
    }
    Ok(SourceTestResult {
        ok: connectivity.ok,
        message: connectivity.message,
    })
}
