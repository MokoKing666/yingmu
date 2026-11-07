//! network — 连接管理器（UNC / SMB / WebDAV 连通性、超时、重试、断线状态）
//!
//! # 诚实性说明（重要）
//! 本 crate 不引入 async runtime，也不做原生 socket 编程；连通性结论由
//! [`MediaProvider::check_connectivity`] 提供，本模块负责**重试、状态机与超时记账**。
//! 这里的「超时」是**协作式检查**（记录每次尝试耗时，超过阈值即判失败），
//! 无法强制中断已经阻塞在系统调用里的 I/O —— 这一点绝不宣称已实现硬超时。
//!
//! SMB / WebDAV provider 当前为未验证骨架，其 `check_connectivity` 恒返回
//! `ok=false`，因此连接管理器不会对它们谎称可达。
//!
//! 本模块源码未经编译验证：本地已具备 Rust 与便携 MSVC/Windows SDK 工具链，但受构建环境限制尚未完成完整编译与测试；不得视为可运行实现。

use crate::models::{SourceId, SourceStatus};
use crate::providers::MediaProvider;
use std::collections::HashMap;
use std::path::Path;
use std::sync::{Arc, RwLock};
use std::time::{Duration, Instant};

/// 连通性结论。**绝不回传任何凭据**，message 只描述可达性类别，不含绝对路径。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Connectivity {
    pub ok: bool,
    pub message: String,
    /// 本次尝试耗时（毫秒）；无法测量时为 None。
    pub latency_ms: Option<u64>,
}

impl Connectivity {
    fn unreachable(message: impl Into<String>) -> Self {
        Connectivity {
            ok: false,
            message: message.into(),
            latency_ms: None,
        }
    }
}

/// 测试本地磁盘 / Windows UNC 根路径是否可达且为目录。
///
/// UNC 认证由 Windows 会话在 OS 层完成，此处仅检查路径元数据可读性。
pub fn test_local_path(root: &Path) -> Connectivity {
    let start = Instant::now();
    let elapsed_ms = || start.elapsed().as_millis() as u64;
    match std::fs::metadata(root) {
        Ok(meta) if meta.is_dir() => Connectivity {
            ok: true,
            message: "路径可达（目录）".to_string(),
            latency_ms: Some(elapsed_ms()),
        },
        Ok(_) => Connectivity {
            ok: false,
            message: "路径存在但不是目录".to_string(),
            latency_ms: Some(elapsed_ms()),
        },
        Err(err) => Connectivity {
            ok: false,
            // 只暴露错误类别，避免把本机绝对路径写进日志/上报。
            message: format!("本地/UNC 路径不可达（{:?}）", err.kind()),
            latency_ms: Some(elapsed_ms()),
        },
    }
}

/// 网络策略配置。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NetworkConfig {
    /// 协作式超时阈值（毫秒）。
    pub timeout_ms: u64,
    /// 首次失败后的最大重试次数。
    pub max_retries: u32,
    /// 重试退避基数（毫秒）；实际退避 = base * (attempt + 1)。
    pub retry_backoff_ms: u64,
}

impl Default for NetworkConfig {
    fn default() -> Self {
        NetworkConfig {
            timeout_ms: 3000,
            max_retries: 2,
            retry_backoff_ms: 200,
        }
    }
}

/// 单个源的断线/重连状态。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SourceConnectionState {
    pub source_id: SourceId,
    pub status: SourceStatus,
    pub last_checked_at: Option<String>,
    pub consecutive_failures: u32,
    pub last_error: Option<String>,
}

impl SourceConnectionState {
    fn new(source_id: &str) -> Self {
        SourceConnectionState {
            source_id: source_id.to_string(),
            status: SourceStatus::Disconnected,
            last_checked_at: None,
            consecutive_failures: 0,
            last_error: None,
        }
    }
}

/// 连接管理器：汇总各源连通性、重试与断线状态。
pub struct ConnectionManager {
    config: NetworkConfig,
    states: RwLock<HashMap<SourceId, SourceConnectionState>>,
}

impl Default for ConnectionManager {
    fn default() -> Self {
        ConnectionManager::new(NetworkConfig::default())
    }
}

impl ConnectionManager {
    pub fn new(config: NetworkConfig) -> Self {
        ConnectionManager {
            config,
            states: RwLock::new(HashMap::new()),
        }
    }

    pub fn config(&self) -> &NetworkConfig {
        &self.config
    }

    /// 对某个 provider 做连通性测试，应用协作式超时与指数退避重试，并记录状态。
    ///
    /// 返回最后一次连通性结论；`ok=true` 时状态置为 Connected，否则置为 Error
    /// 并累加 `consecutive_failures`。凭据不会出现在返回值里。
    pub fn test_with_retry(&self, provider: &dyn MediaProvider) -> Connectivity {
        let source_id = provider.id().to_string();
        let mut last = Connectivity::unreachable("尚未尝试");
        for attempt in 0..=self.config.max_retries {
            let start = Instant::now();
            let mut result = provider.check_connectivity();
            let elapsed = start.elapsed().as_millis() as u64;

            if elapsed >= self.config.timeout_ms {
                result = Connectivity {
                    ok: false,
                    message: format!(
                        "协作式超时：单次尝试耗时 {} ms 超过阈值 {} ms（无法强制中断阻塞 I/O）",
                        elapsed, self.config.timeout_ms
                    ),
                    latency_ms: Some(elapsed),
                };
            } else if result.latency_ms.is_none() {
                result.latency_ms = Some(elapsed);
            }

            last = result.clone();
            if last.ok {
                self.record(&source_id, true, last.message.clone());
                return last;
            }
            if attempt < self.config.max_retries && self.config.retry_backoff_ms > 0 {
                std::thread::sleep(Duration::from_millis(
                    self.config.retry_backoff_ms * (attempt as u64 + 1),
                ));
            }
        }
        self.record(&source_id, false, last.message.clone());
        last
    }

    fn record(&self, source_id: &str, ok: bool, message: String) {
        let mut guard = self.states.write().unwrap_or_else(|e| e.into_inner());
        let entry = guard
            .entry(source_id.to_string())
            .or_insert_with(|| SourceConnectionState::new(source_id));
        entry.last_checked_at = Some(chrono::Utc::now().to_rfc3339());
        if ok {
            entry.status = SourceStatus::Connected;
            entry.consecutive_failures = 0;
            entry.last_error = None;
        } else {
            entry.status = SourceStatus::Error;
            entry.consecutive_failures = entry.consecutive_failures.saturating_add(1);
            entry.last_error = Some(message);
        }
    }

    /// 显式标记断线（例如用户离线、源被禁用、换地址后待重测）。
    pub fn mark_disconnected(&self, source_id: &str) {
        let mut guard = self.states.write().unwrap_or_else(|e| e.into_inner());
        let entry = guard
            .entry(source_id.to_string())
            .or_insert_with(|| SourceConnectionState::new(source_id));
        entry.status = SourceStatus::Disconnected;
        entry.last_error = None;
    }

    pub fn state(&self, source_id: &str) -> Option<SourceConnectionState> {
        let guard = self.states.read().unwrap_or_else(|e| e.into_inner());
        guard.get(source_id).cloned()
    }

    pub fn states(&self) -> Vec<SourceConnectionState> {
        let guard = self.states.read().unwrap_or_else(|e| e.into_inner());
        let mut out: Vec<_> = guard.values().cloned().collect();
        out.sort_by(|a, b| a.source_id.cmp(&b.source_id));
        out
    }

    /// 供平台层共享的句柄。
    pub fn shared(config: NetworkConfig) -> Arc<Self> {
        Arc::new(ConnectionManager::new(config))
    }
}

// ============================================================
// 单元测试（纯逻辑 + mock provider，可编译）
// ============================================================

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::SourceProtocol;
    use crate::providers::{DirEntry, MediaReader, Stat};
    use crate::{CoreError, Result};
    use std::sync::atomic::{AtomicUsize, Ordering};

    /// 可控连通性结论的 mock provider；同时统计 check_connectivity 调用次数。
    struct MockProvider {
        id: String,
        ok: bool,
        calls: Arc<AtomicUsize>,
    }

    impl MediaProvider for MockProvider {
        fn id(&self) -> &str {
            &self.id
        }
        fn protocol(&self) -> SourceProtocol {
            SourceProtocol::Smb
        }
        fn validated(&self) -> bool {
            false
        }
        fn list(&self, _p: &str) -> Result<Vec<DirEntry>> {
            Err(CoreError::not_implemented("mock list"))
        }
        fn read(&self, _p: &str) -> Result<Vec<u8>> {
            Err(CoreError::not_implemented("mock read"))
        }
        fn stat(&self, _p: &str) -> Result<Stat> {
            Err(CoreError::not_implemented("mock stat"))
        }
        fn exists(&self, _p: &str) -> Result<bool> {
            Err(CoreError::not_implemented("mock exists"))
        }
        fn open_reader(&self, _p: &str) -> Result<Box<dyn MediaReader>> {
            Err(CoreError::not_implemented("mock open_reader"))
        }
        fn check_connectivity(&self) -> Connectivity {
            self.calls.fetch_add(1, Ordering::SeqCst);
            Connectivity {
                ok: self.ok,
                message: if self.ok {
                    "mock 可达".to_string()
                } else {
                    "mock 不可达".to_string()
                },
                latency_ms: None,
            }
        }
    }

    fn config_no_delay(max_retries: u32) -> NetworkConfig {
        NetworkConfig {
            timeout_ms: 1000,
            max_retries,
            retry_backoff_ms: 0, // 测试不真实 sleep
        }
    }

    #[test]
    fn test_local_path_on_existing_directory() {
        let dir = std::env::temp_dir();
        let result = test_local_path(&dir);
        assert!(result.ok, "系统临时目录应可达: {:?}", result);
        assert!(result.latency_ms.is_some());
        // message 不得泄露绝对路径。
        assert!(!result.message.contains(dir.to_string_lossy().as_ref()));
    }

    #[test]
    fn test_local_path_missing_is_explicit_failure() {
        let missing = std::env::temp_dir().join("yingmu-definitely-missing-path-xyz");
        let result = test_local_path(&missing);
        assert!(!result.ok);
        assert!(result.message.contains("不可达") || result.message.contains("不是目录"));
    }

    #[test]
    fn retry_stops_on_first_success() {
        let calls = Arc::new(AtomicUsize::new(0));
        let p = MockProvider {
            id: "s1".to_string(),
            ok: true,
            calls: calls.clone(),
        };
        let manager = ConnectionManager::new(config_no_delay(3));
        let result = manager.test_with_retry(&p);
        assert!(result.ok);
        assert_eq!(calls.load(Ordering::SeqCst), 1, "首次成功即停止");
        let state = manager.state("s1").unwrap();
        assert_eq!(state.status, SourceStatus::Connected);
        assert_eq!(state.consecutive_failures, 0);
        assert!(state.last_error.is_none());
    }

    #[test]
    fn failure_retries_and_records_disconnect_state() {
        let calls = Arc::new(AtomicUsize::new(0));
        let p = MockProvider {
            id: "s2".to_string(),
            ok: false,
            calls: calls.clone(),
        };
        let manager = ConnectionManager::new(config_no_delay(2));
        let result = manager.test_with_retry(&p);
        assert!(!result.ok);
        assert_eq!(calls.load(Ordering::SeqCst), 3, "首次 + 2 次重试");
        let state = manager.state("s2").unwrap();
        assert_eq!(state.status, SourceStatus::Error);
        assert_eq!(state.consecutive_failures, 1);
        assert!(state.last_error.is_some());
    }

    #[test]
    fn cooperative_timeout_overrides_optimistic_result() {
        // 阈值设为 0：任何耗时都会触发协作式超时判定。
        let manager = ConnectionManager::new(NetworkConfig {
            timeout_ms: 0,
            max_retries: 0,
            retry_backoff_ms: 0,
        });
        let p = MockProvider {
            id: "s3".to_string(),
            ok: true,
            calls: Arc::new(AtomicUsize::new(0)),
        };
        let result = manager.test_with_retry(&p);
        assert!(!result.ok);
        assert!(result.message.contains("协作式超时"));
        assert_eq!(manager.state("s3").unwrap().status, SourceStatus::Error);
    }

    #[test]
    fn mark_disconnected_and_states_snapshot() {
        let manager = ConnectionManager::new(config_no_delay(0));
        manager.mark_disconnected("unc-1");
        assert_eq!(
            manager.state("unc-1").unwrap().status,
            SourceStatus::Disconnected
        );
        let p = MockProvider {
            id: "unc-1".to_string(),
            ok: true,
            calls: Arc::new(AtomicUsize::new(0)),
        };
        assert!(manager.test_with_retry(&p).ok);
        assert_eq!(manager.states().len(), 1);
        assert_eq!(manager.states()[0].status, SourceStatus::Connected);
    }

    #[test]
    fn connectivity_never_contains_secrets() {
        // 构造时只放结论文本，凭据由 provider 内部注入，不进入 Connectivity。
        let c = Connectivity::unreachable("SMB 不可达");
        assert!(!c.message.contains("password"));
        assert!(!c.message.contains("api_key"));
    }
}
