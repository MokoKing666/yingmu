//! 影幕 YingMu — Tauri 2 桌面端壳
//!
//! # 诚实性声明（最高优先级）
//! 本模块源码**未经编译验证**，不得视为可运行实现：Rust 工具链 1.99.1 已安装
//! （未在 PATH）；本地已具备便携 MSVC/Windows SDK 工具链，但受构建环境限制，源码已落地而未经完整编译验证。
//! libmpv 未集成、NSIS 未构建、HDR/Dolby 输出未验证、测试未运行。
//!
//! # 数据目录约定
//! 用户数据只写在 `%APPDATA%\YingMu` 与 `%LOCALAPPDATA%\YingMu` 下，
//! **绝不写入安装目录**（`currentUser` 安装模式下安装目录通常不可写）。

pub mod commands;

use serde::Deserialize;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, MutexGuard, RwLock};
use tauri::Manager;
use yingmu_core::artwork::ArtworkCache;
use yingmu_core::database::Database;
use yingmu_core::models::{
    AppSettings, AudioOutput, HardwareDecoding, Language, MediaSource, ResumeBehaviour,
    ScanProgress, SourceProtocol, ThemeMode,
};
use yingmu_core::network::{ConnectionManager, NetworkConfig};
use yingmu_core::player::MpvBackend;
use yingmu_core::providers::{
    CredentialRef, LocalProvider, MediaProvider, ProviderRegistry, SmbProvider, WebDavProvider,
};
use yingmu_core::scanner::CancelToken;

/// 用户数据子目录名。
///
/// 按用户数据目录规范固定为 `YingMu`（`%APPDATA%\YingMu`、
/// `%LOCALAPPDATA%\YingMu\Cache`、`%LOCALAPPDATA%\YingMu\Logs`），
/// ADR 0005 已同步为一致表述；`com.moko.yingmu` 仅为应用标识符（Bundle ID），
/// 不用作目录名。该常量为目录名的唯一来源，便于单点维护。
const DATA_DIR_NAME: &str = "YingMu";

/// 解析后的用户数据目录（全部位于 APPDATA / LOCALAPPDATA）。
#[derive(Debug, Clone)]
pub struct DataDirs {
    /// 数据库与设置：`%APPDATA%\YingMu`
    pub app_data: PathBuf,
    /// 封面缓存：`%LOCALAPPDATA%\YingMu\Cache`
    pub cache: PathBuf,
    /// 日志：`%LOCALAPPDATA%\YingMu\Logs`
    pub logs: PathBuf,
}

impl DataDirs {
    pub fn resolve() -> Result<Self, String> {
        // 用 var_os 以兼容非 UTF-8 的 Windows 用户目录。
        let appdata = std::env::var_os("APPDATA")
            .ok_or_else(|| "APPDATA 环境变量缺失，无法确定用户数据目录".to_string())?;
        let localappdata = std::env::var_os("LOCALAPPDATA")
            .ok_or_else(|| "LOCALAPPDATA 环境变量缺失，无法确定缓存目录".to_string())?;
        let app_data = PathBuf::from(appdata).join(DATA_DIR_NAME);
        let cache = PathBuf::from(&localappdata)
            .join(DATA_DIR_NAME)
            .join("Cache");
        let logs = PathBuf::from(&localappdata)
            .join(DATA_DIR_NAME)
            .join("Logs");
        for dir in [&app_data, &cache, &logs] {
            std::fs::create_dir_all(dir).map_err(|e| format!("创建用户数据目录失败: {}", e))?;
        }
        Ok(DataDirs {
            app_data,
            cache,
            logs,
        })
    }

    pub fn database_path(&self) -> PathBuf {
        self.app_data.join("yingmu.db")
    }

    pub fn settings_path(&self) -> PathBuf {
        self.app_data.join("settings.json")
    }
}

/// `settingsSet(patch)` 对应的 Partial<AppSettings>。
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct AppSettingsPatch {
    pub theme: Option<ThemeMode>,
    pub language: Option<Language>,
    pub prefer_hdr_passthrough: Option<bool>,
    pub audio_output: Option<AudioOutput>,
    pub subtitle_font_size: Option<i64>,
    pub subtitle_font_family: Option<String>,
    pub subtitle_color: Option<String>,
    pub subtitle_position: Option<i64>,
    pub subtitle_delay_ms: Option<i64>,
    pub hardware_decoding: Option<HardwareDecoding>,
    pub resume_behaviour: Option<ResumeBehaviour>,
    pub tmdb_configured: Option<bool>,
}

fn load_settings(path: &Path) -> AppSettings {
    match std::fs::read_to_string(path) {
        Ok(text) => serde_json::from_str(&text).unwrap_or_else(|_| AppSettings::default()),
        Err(_) => AppSettings::default(),
    }
}

fn persist_settings(path: &Path, settings: &AppSettings) -> Result<(), String> {
    let text = serde_json::to_string_pretty(settings).map_err(|e| e.to_string())?;
    std::fs::write(path, text).map_err(|e| format!("保存设置失败: {}", e))?;
    Ok(())
}

/// 把已存在的媒体源注册进 ProviderRegistry。
///
/// 凭据永远通过安全存储注入：当前阶段平台层尚未提供安全存储实现，
/// 因此 SmbProvider / WebDavProvider 只带 `CredentialRef::None` 占位，
/// 其连通性测试会如实返回不可达，绝不伪造成功。
pub(crate) fn register_provider(registry: &mut ProviderRegistry, source: &MediaSource) {
    let id = source.id.clone();
    let uri = source.uri.clone();
    let provider: Arc<dyn MediaProvider> = match source.protocol {
        SourceProtocol::Local | SourceProtocol::Unc => Arc::new(LocalProvider::new(id, uri)),
        SourceProtocol::Smb => Arc::new(SmbProvider::new(id, uri, CredentialRef::None)),
        SourceProtocol::WebDav => Arc::new(WebDavProvider::new(id, uri, CredentialRef::None)),
    };
    // 已注册则忽略（重复注册错误不影响启动）。
    let _ = registry.register(provider);
}

/// 应用全局状态；由 `app.manage()` 注入，command 通过 `State<'_, AppState>` 访问。
pub struct AppState {
    pub db: Mutex<Database>,
    pub settings: RwLock<AppSettings>,
    pub settings_path: PathBuf,
    pub data_dirs: DataDirs,
    pub providers: Mutex<ProviderRegistry>,
    pub connections: Arc<ConnectionManager>,
    pub artwork: ArtworkCache,
    pub player: Mutex<MpvBackend>,
    pub scan_tokens: Mutex<HashMap<String, CancelToken>>,
    pub scan_progress: Mutex<HashMap<String, ScanProgress>>,
}

impl AppState {
    pub fn new() -> Result<Self, String> {
        let data_dirs = DataDirs::resolve()?;
        let db = Database::open(data_dirs.database_path()).map_err(|e| e.to_string())?;
        let settings = load_settings(&data_dirs.settings_path());

        // 重启后恢复已保存的媒体源到注册表。
        let mut providers = ProviderRegistry::new();
        for source in db.list_sources().map_err(|e| e.to_string())? {
            register_provider(&mut providers, &source);
        }

        let artwork = ArtworkCache::with_defaults(data_dirs.cache.join("Artwork"));
        Ok(AppState {
            db: Mutex::new(db),
            settings: RwLock::new(settings),
            settings_path: data_dirs.settings_path(),
            data_dirs,
            providers: Mutex::new(providers),
            connections: ConnectionManager::shared(NetworkConfig::default()),
            artwork,
            player: Mutex::new(MpvBackend::new()),
            scan_tokens: Mutex::new(HashMap::new()),
            scan_progress: Mutex::new(HashMap::new()),
        })
    }

    pub fn db(&self) -> Result<MutexGuard<'_, Database>, String> {
        self.db.lock().map_err(|e| e.to_string())
    }

    pub fn settings(&self) -> Result<AppSettings, String> {
        Ok(self.settings.read().map_err(|e| e.to_string())?.clone())
    }

    pub fn update_settings(&self, patch: &AppSettingsPatch) -> Result<AppSettings, String> {
        let mut guard = self.settings.write().map_err(|e| e.to_string())?;
        if let Some(v) = patch.theme {
            guard.theme = v;
        }
        if let Some(v) = patch.language {
            guard.language = v;
        }
        if let Some(v) = patch.prefer_hdr_passthrough {
            guard.prefer_hdr_passthrough = v;
        }
        if let Some(v) = patch.audio_output {
            guard.audio_output = v;
        }
        if let Some(v) = patch.subtitle_font_size {
            guard.subtitle_font_size = v;
        }
        if let Some(v) = &patch.subtitle_font_family {
            guard.subtitle_font_family = v.clone();
        }
        if let Some(v) = &patch.subtitle_color {
            guard.subtitle_color = v.clone();
        }
        if let Some(v) = patch.subtitle_position {
            guard.subtitle_position = v;
        }
        if let Some(v) = patch.subtitle_delay_ms {
            guard.subtitle_delay_ms = v;
        }
        if let Some(v) = patch.hardware_decoding {
            guard.hardware_decoding = v;
        }
        if let Some(v) = patch.resume_behaviour {
            guard.resume_behaviour = v;
        }
        if let Some(v) = patch.tmdb_configured {
            guard.tmdb_configured = v;
        }
        persist_settings(&self.settings_path, &guard)?;
        Ok(guard.clone())
    }
}

/// 应用入口：初始化状态 → 注册全部 IPC command → 运行。
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let state = AppState::new().map_err(|e| -> Box<dyn std::error::Error> { e.into() })?;
            app.manage(state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::library::yingmu_library_list,
            commands::library::yingmu_library_get,
            commands::library::yingmu_library_update_metadata,
            commands::library::yingmu_library_set_favorite,
            commands::library::yingmu_library_versions,
            commands::sources::yingmu_source_list,
            commands::sources::yingmu_source_add,
            commands::sources::yingmu_source_remove,
            commands::sources::yingmu_source_test,
            commands::scan::yingmu_scan_start,
            commands::scan::yingmu_scan_cancel,
            commands::scan::yingmu_scan_status,
            commands::search::yingmu_search,
            commands::artwork::yingmu_artwork_get,
            commands::artwork::yingmu_artwork_rebuild,
            commands::history::yingmu_history_list,
            commands::history::yingmu_history_save,
            commands::playlists::yingmu_playlist_list,
            commands::playlists::yingmu_playlist_save,
            commands::playlists::yingmu_playlist_remove,
            commands::player::yingmu_player_open,
            commands::player::yingmu_player_control,
            commands::player::yingmu_player_state,
            commands::player::yingmu_player_attach_surface,
            commands::settings::yingmu_settings_get,
            commands::settings::yingmu_settings_set,
            commands::layout::yingmu_layout_get,
            commands::layout::yingmu_layout_set,
            commands::diagnostics::yingmu_diagnostics_report,
        ])
        .run(tauri::generate_context!())
        .expect("影幕 YingMu 启动失败");
}
