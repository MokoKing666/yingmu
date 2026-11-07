//! diagnosticsReport — 生成诊断报告（未探测能力一律 not verified）

use crate::AppState;
use tauri::State;
use yingmu_core::diagnostics::{generate_report, DiagnosticsContext};
use yingmu_core::models::{Backend, DiagnosticsReport};

#[tauri::command(rename_all = "camelCase")]
pub fn yingmu_diagnostics_report(state: State<'_, AppState>) -> Result<DiagnosticsReport, String> {
    let db_version = state.db()?.db_version().unwrap_or(0);
    // Provider 验证状态来自真实注册表；当前全部为 false。
    let provider_validation = {
        let registry = state.providers.lock().map_err(|e| e.to_string())?;
        registry
            .ids()
            .into_iter()
            .map(|id| {
                let validated = registry.get(&id).map(|p| p.validated()).unwrap_or(false);
                (id, validated)
            })
            .collect()
    };
    // 后端未集成、WebView2/GPU/显示能力均未在本机探测，如实传入 None/None。
    Ok(generate_report(&DiagnosticsContext {
        db_version,
        backend: Backend::None,
        backend_ready: false,
        webview2_version: None,
        gpu_adapter: None,
        display_caps: None,
        provider_validation,
    }))
}
