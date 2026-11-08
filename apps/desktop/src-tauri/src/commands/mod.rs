//! commands — `packages/media-models/src/bridge.ts` 中 `IPC` 常量的 Rust 实现
//!
//! 命名约束：每个 `#[tauri::command]` 的函数名与注册名必须与 `IPC` 常量完全一致；
//! 所有命令统一使用 `#[tauri::command(rename_all = "camelCase")]`，使 Rust 的
//! `source_id` 等参数在前端以 `sourceId` 形式传入。
//!
//! 返回约定：成功返回真实结构；未实现/未验证的能力返回明确错误字符串，绝不假成功。

pub mod artwork;
pub mod diagnostics;
pub mod history;
pub mod layout;
pub mod library;
pub mod player;
pub mod playlists;
pub mod scan;
pub mod search;
pub mod settings;
pub mod sources;
