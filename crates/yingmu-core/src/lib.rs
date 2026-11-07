//! 影幕 YingMu — 媒体核心库（yingmu-core）
//!
//! 本 crate 是平台无关的业务核心，供 `apps/desktop/src-tauri` 通过 Tauri command 调用。
//! 它不依赖 tauri / WebView2 / libmpv，保证可独立进行纯逻辑单元测试。
//!
//! # 诚实性声明（最高优先级）
//! 本模块源码**未经编译验证**，不得视为可运行实现：Rust 工具链 1.99.1 已安装
//! （未在 PATH），但 MSVC / Windows SDK / link.exe 缺失；源码已落地但未经编译验证。
//! 所有依赖版本、API 调用与平台行为均按 crates.io 稳定版文档编写，但尚未经过
//! `cargo check` / `cargo test` / `cargo clippy` 验证。集成 libmpv、NSIS 打包、
//! HDR/Dolby 原生输出等能力一律未验证，详见各模块 README 与注释。
//!
//! # 数据契约
//! `database::models` 与 `packages/media-models/src/types.ts`、`.../bridge.ts`
//! 字段一一对应，结构体统一使用 `#[serde(rename_all = "camelCase")]`，
//! 枚举使用显式 `#[serde(rename = "...")]` 以精确匹配 TypeScript 字面量联合类型。

pub mod artwork;
pub mod database;
pub mod diagnostics;
pub mod history;
pub mod metadata;
pub mod network;
pub mod player;
pub mod providers;
pub mod scanner;
pub mod subtitles;

pub use database::models;
pub use database::models::{default_settings, AppSettings, DiagnosticsReport, DisplayCaps};

use thiserror::Error;

/// 应用语义版本，与 tauri.conf.json / package.json 保持一致。
pub const VERSION: &str = "0.1.0";

/// 全项目唯一应用标识符；禁止使用 com.yingmu.player。
pub const APP_IDENTIFIER: &str = "com.moko.yingmu";

/// 统一结果别名。
pub type Result<T> = std::result::Result<T, CoreError>;

/// 核心统一错误类型。
///
/// 设计要点：区分「未实现」（功能尚不存在）与「未验证」（存在但未实机验证），
/// 避免把骨架能力伪装成已交付能力。Tauri command 层通过 `to_string()` 转成前端可读错误。
#[derive(Debug, Error)]
pub enum CoreError {
    #[error("IO 错误: {0}")]
    Io(#[from] std::io::Error),

    #[error("数据库错误: {0}")]
    Database(#[from] rusqlite::Error),

    #[error("XML 解析错误: {0}")]
    Xml(#[from] roxmltree::Error),

    #[error("JSON 序列化/反序列化错误: {0}")]
    Json(#[from] serde_json::Error),

    /// 功能尚未实现：必须返回明确错误，绝不返回假成功。
    #[error("未实现: {0}")]
    NotImplemented(String),

    /// 能力存在但未经本机实机验证（如 libmpv、HDR 输出）。
    #[error("未验证的能力: {0}")]
    Unvalidated(String),

    /// 凭据仅允许从安全存储/环境变量注入，缺失时报错而非使用占位明文。
    #[error("凭据缺失: {0}")]
    CredentialMissing(String),

    #[error("未找到: {0}")]
    NotFound(String),

    #[error("无效的 URI/路径: {0}")]
    InvalidPath(String),

    #[error("网络错误: {0}")]
    Network(String),

    #[error("操作已取消")]
    Cancelled,

    #[error("配置错误: {0}")]
    Config(String),

    #[error("探测结果不可用: {0}")]
    ProbeUnavailable(String),
}

impl CoreError {
    /// 便捷构造：把一个能力名包装成「未验证」错误。
    pub fn unvalidated(feature: impl Into<String>) -> Self {
        CoreError::Unvalidated(feature.into())
    }

    /// 便捷构造：把功能名包装成「未实现」错误。
    pub fn not_implemented(feature: impl Into<String>) -> Self {
        CoreError::NotImplemented(feature.into())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn version_and_identifier_are_stable() {
        assert_eq!(VERSION, "0.1.0");
        assert_eq!(APP_IDENTIFIER, "com.moko.yingmu");
        // 明令禁止的旧标识符不得出现。
        assert_ne!(APP_IDENTIFIER, "com.yingmu.player");
    }

    #[test]
    fn error_display_is_explicit_about_unimplemented_and_unvalidated() {
        let a = CoreError::not_implemented("SMB 列举");
        assert!(a.to_string().contains("未实现"));
        let b = CoreError::unvalidated("libmpv 渲染");
        assert!(b.to_string().contains("未验证"));
    }

    #[test]
    fn default_settings_match_contract_literals() {
        let s = default_settings();
        assert!(!s.prefer_hdr_passthrough, "默认不得宣称 HDR 直通能力");
        assert!(!s.tmdb_configured, "默认不得声称已配置 TMDB");
        assert_eq!(s.subtitle_font_size, 24);
    }
}
