//! diagnostics — 生成 `DiagnosticsReport`
//!
//! # 诚实性约束（最高优先级）
//! **未探测到的能力一律标注 `not verified`**。本报告绝不因为「代码里写了某个能力」
//! 就把它标记为可用：
//! - libmpv 未集成 → `backend = none`、`backendReady = false`；
//! - WebView2 版本 / GPU 适配器 / 显示能力未探测 → 对应字段为 `None`，并在 notes 标注；
//! - 即使探测到 HDR 支持，也只代表「显示能力」，**不代表 HDR 原生输出已验证**；
//! - 每个未实机验证的 Provider 都在 notes 中逐条列出。
//!
//! 本模块源码未经编译验证：本地已具备 Rust 与便携 MSVC/Windows SDK 工具链，但受构建环境限制尚未完成完整编译与测试；不得视为可运行实现。

use crate::models::{Backend, DiagnosticsReport, DisplayCaps};
use crate::VERSION;

/// 生成报告所需的「已探测事实」集合。字段为 None 即代表未探测。
#[derive(Debug, Clone)]
pub struct DiagnosticsContext {
    pub db_version: i64,
    pub backend: Backend,
    pub backend_ready: bool,
    pub webview2_version: Option<String>,
    pub gpu_adapter: Option<String>,
    pub display_caps: Option<DisplayCaps>,
    /// (Provider 名称, 是否已实机验证)
    pub provider_validation: Vec<(String, bool)>,
}

impl Default for DiagnosticsContext {
    fn default() -> Self {
        DiagnosticsContext {
            db_version: 0,
            backend: Backend::None,
            backend_ready: false,
            webview2_version: None,
            gpu_adapter: None,
            display_caps: None,
            provider_validation: Vec::new(),
        }
    }
}

/// 生成诊断报告：逐项如实标注，未探测能力一律 `not verified`。
pub fn generate_report(ctx: &DiagnosticsContext) -> DiagnosticsReport {
    let mut notes: Vec<String> = Vec::new();
    notes.push(format!("影幕 YingMu 版本 {}", VERSION));
    notes.push(format!("数据库迁移版本 {}", ctx.db_version));

    match ctx.backend {
        Backend::None => notes.push(
            "播放器后端: none — libmpv 未集成 / 未实机验证 not verified".to_string(),
        ),
        Backend::Mpv => notes.push(
            "播放器后端: mpv — 仅当确实完成集成与技术验证后才可设置；HDR/Dolby 输出未验证 not verified"
                .to_string(),
        ),
    }
    notes.push(format!(
        "backendReady={} — 播放器后端未初始化时不得谎称可用",
        ctx.backend_ready
    ));

    match &ctx.webview2_version {
        Some(v) => notes.push(format!("WebView2 版本: {}", v)),
        None => notes.push("WebView2 版本: 未探测 not verified".to_string()),
    }
    match &ctx.gpu_adapter {
        Some(g) => notes.push(format!("GPU 适配器: {}", g)),
        None => notes.push("GPU 适配器: 未探测 not verified".to_string()),
    }
    match &ctx.display_caps {
        Some(caps) => notes.push(format!(
            "显示能力: 已探测 {:?}；注意：探测到 HDR 支持不代表 HDR 原生输出已验证 not verified",
            caps
        )),
        None => notes.push(
            "显示能力（HDR/位深/色彩空间）: 未探测 not verified；探测到也不代表 HDR 原生输出已验证"
                .to_string(),
        ),
    }

    for (name, validated) in &ctx.provider_validation {
        if *validated {
            notes.push(format!("Provider {}: 已实机验证", name));
        } else {
            notes.push(format!("Provider {}: 未实机验证 not verified", name));
        }
    }

    notes.push(
        "能力模型: identified → metadata-parsed → decoded → rendered → native-output，\
         任一层不得由上一层推定成立；识别到 HDR 标识不等于具备 HDR 原生输出"
            .to_string(),
    );

    DiagnosticsReport {
        app_version: VERSION.to_string(),
        backend: ctx.backend,
        backend_ready: ctx.backend_ready,
        webview2_version: ctx.webview2_version.clone(),
        gpu_adapter: ctx.gpu_adapter.clone(),
        display_caps: ctx.display_caps.clone(),
        db_version: ctx.db_version,
        notes,
    }
}

/// 在无任何真实探测结果时使用的默认报告（供 Tauri command 兜底）。
pub fn default_report(db_version: i64) -> DiagnosticsReport {
    generate_report(&DiagnosticsContext {
        db_version,
        ..DiagnosticsContext::default()
    })
}

// ============================================================
// 单元测试（纯逻辑，可编译）
// ============================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_report_never_claims_backend_ready() {
        let report = default_report(2);
        assert_eq!(report.app_version, "0.1.0");
        assert_eq!(report.backend, Backend::None);
        assert!(!report.backend_ready);
        assert_eq!(report.db_version, 2);
        assert!(report.webview2_version.is_none());
        assert!(report.gpu_adapter.is_none());
        assert!(report.display_caps.is_none());
    }

    #[test]
    fn undetected_capabilities_are_marked_not_verified() {
        let report = default_report(0);
        let notes = report.notes.join("\n");
        assert!(
            notes.contains("not verified"),
            "未探测能力必须标注 not verified"
        );
        assert!(notes.contains("WebView2 版本: 未探测 not verified"));
        assert!(notes.contains("GPU 适配器: 未探测 not verified"));
        assert!(notes.contains("显示能力（HDR/位深/色彩空间）: 未探测 not verified"));
    }

    #[test]
    fn report_never_claims_hdr_native_output() {
        let report = default_report(0);
        let notes = report.notes.join("\n");
        assert!(notes.contains("不代表 HDR 原生输出已验证"));
        assert!(!report.backend_ready);
    }

    #[test]
    fn detected_values_are_reported_without_upgrading_claims() {
        let ctx = DiagnosticsContext {
            db_version: 2,
            webview2_version: Some("120.0.0.0".to_string()),
            gpu_adapter: Some("Generic Adapter".to_string()),
            display_caps: Some(DisplayCaps {
                hdr_supported: Some(true),
                bit_depth: Some(10),
                color_space: Some("bt2020nc".to_string()),
            }),
            provider_validation: vec![
                ("LocalProvider".to_string(), false),
                ("SmbProvider".to_string(), false),
            ],
            ..DiagnosticsContext::default()
        };
        let report = generate_report(&ctx);
        assert_eq!(report.webview2_version.as_deref(), Some("120.0.0.0"));
        assert_eq!(report.display_caps.as_ref().unwrap().bit_depth, Some(10));
        assert_eq!(report.backend, Backend::None);
        assert!(!report.backend_ready);
        let notes = report.notes.join("\n");
        assert!(notes.contains("未实机验证 not verified"));
        assert!(notes.contains("不代表 HDR 原生输出已验证"));
    }
}
