# ADR 0002：平台桥接与 WebDemoBridge

| 项 | 内容 |
| --- | --- |
| 编号 | 0002 |
| 日期 | 2026-11-06 |
| 状态 | **已接受** |
| 相关 | `0001-technology-stack`、`docs/architecture/ipc-contract.md`、`docs/architecture/overview.md` |

## 状态

已接受。`PlatformBridge` 接口与 `IPC` 命令名常量已在 `packages/media-models/src/bridge.ts` 定义（共 27 条命令）；**`TauriBridge` 与 Rust 侧命令处理源码已落地，但未经编译验证**（本地工具链已就位，受构建环境限制未完成完整编译与测试）；`WebDemoBridge` 为浏览器/Vite/CI 下的演示实现。

## 背景

- 业务核心必须与平台层解耦：Windows 专属实现（D3D11、HWND、WASAPI、WebView2、文件系统）不得进入 React 组件或纯 TS 契约层。
- **本机实测：Rust 1.99.1 已安装；本地已具备 MSVC 编译器/链接器与 Windows SDK 导入库/头文件（便携工具链，非系统级 Visual Studio 安装，需显式配置 `PATH` / `LIB` / `INCLUDE`）**。但 `cargo fmt --all -- --check` 已通过（exit 0，格式已归一化）；`cargo check` / `cargo test` / `cargo clippy` 受构建环境限制未成功完成，仓库 Rust 代码仍未经完整编译与测试验证，所有 `#[cfg(test)]` 单元测试未运行。实际阻断有两类：默认 shell 中 Git Bash 的 `/usr/bin/link.exe`（GNU coreutils 硬链接命令）遮蔽 MSVC 链接器，报 `link: extra operand`；部分执行通道存在 safe-delete 删除拦截，cargo 清理 rlib 临时目录时返回 `拒绝访问 (os error 5)`。二者均发生在第三方依赖编译阶段，未到达 `yingmu-core` 自身源码类型检查完成，Tauri 应用尚无编译产物、安装包本阶段未生成。若前端必须依赖 Tauri 编译产物才能运行，则前端在本机无法开发、测试、截图，整个工程不可验证。
- 需要一个既能在浏览器/CI 真实运行、又能在桌面端对接原生能力的统一抽象，且两者对业务代码透明。
- 契约要求：`bridge.ts` 顶部注释明确「禁止在 React 组件内直接调用 `window.__TAURI__`、`fs` 或任何平台 API」。

## 决策

引入 `PlatformBridge` 作为前端与平台层的**唯一契约**，并提供两种实现：

| 实现 | 运行环境 | 数据来源 | 现状 |
| --- | --- | --- | --- |
| `WebDemoBridge` | 浏览器 / Vite dev / CI | 内置演示数据 + `localStorage` | 演示路径，可让前端在**不编译 Tauri 桌面端**时真实运行、测试、截图 |
| `TauriBridge` | Tauri 桌面端 | 类型安全 IPC → Rust 核心 | **源码已落地，未经编译验证**（受构建环境限制，未经编译验证） |

配套决策：

1. `IPC` 常量以 `as const` 定义 27 个命令名，与 Rust `#[tauri::command]` 一一对应（`docs/architecture/ipc-contract.md`）；`playlistRemove: 'yingmu_playlist_remove'` 已补齐并在 `generate_handler!` 注册。
2. `PlatformBridge.kind` 为 `'web-demo' | 'tauri'`，业务代码不感知具体实现。
3. 前端只依赖接口，不直接引用平台 API；能力（文件、数据库、扫描、设置、诊断、播放）全部经桥接方法注入。
4. 诊断诚实：`DiagnosticsReport.backend` 在后端未初始化时必须是 `'none'`、`backendReady: false`，不得谎称可用。

### 为何引入 WebDemoBridge

- **解耦运行条件**：把「前端可运行性」与「平台层是否编译」分开。Node/npm 齐全即可用 `npm run dev` 真实运行前端，不受桌面端构建产物是否就绪的影响。本机 Rust 工具链已就位，但受构建环境限制尚未产出桌面端构建产物，前端依然可独立运行。
- **可测试性与可截图**：Vitest、构建、类型检查、视觉核对都能在浏览器/CI 中真实执行，而无需 Tauri 产物。2026-11-06 本机实测印证了这一点：`npm run typecheck` / `lint` / `test`（50 用例）/ `build`、凭据扫描、仓库契约测试全部通过，界面截图来自 `vite preview` 真实运行实例（见 README「界面截图」章节）。
- **契约先行**：接口与命令名在平台层通过编译验证前即可被前端消费并校验，避免两端各自演化。
- **安全边界**：演示数据只是「可运行的假数据」，不是平台能力；文档与诊断必须明确区分，不得把演示返回当作已实现。

## 后果

正面：

- 本机（工具链已就位、但桌面端构建产物尚未产出）仍可真实运行前端，工程可开发、可测试、可截图；前端 6 项检查已实测通过。
- 业务核心保持平台无关，便于跨平台抽象与 TS/Rust 双侧一致性检查。

负面 / 待解决：

- 两套实现必须持续保持接口一致；`IPC` 命令名、入参、返回、TS 字段与 Rust 模型需两侧同步并写 ADR。
- `WebDemoBridge` 返回的是演示数据，**绝不代表**数据库、扫描、播放、HDR 等真实能力已实现或通过验证。
- 当前 `PlatformBridge` 接口与 `IPC` 常量仍有一处待对齐点（`player*` 命令未在接口暴露），见 `docs/architecture/ipc-contract.md` 第 4 节；`playlistRemove` 命令名已补齐，该待对齐点已消除。
- `TauriBridge` / Rust 命令实现源码已落地但未经编译验证；`cargo fmt --all -- --check` 已通过（exit 0，格式已归一化）；`cargo check` / `cargo test` / `cargo clippy` 受构建环境限制未成功完成，仓库 Rust 代码仍未经完整编译与测试验证，所有 `#[cfg(test)]` 单元测试未运行。实际阻断有两类：默认 shell 中 Git Bash 的 `/usr/bin/link.exe`（GNU coreutils 硬链接命令）遮蔽 MSVC 链接器，报 `link: extra operand`；部分执行通道存在 safe-delete 删除拦截，cargo 清理 rlib 临时目录时返回 `拒绝访问 (os error 5)`。二者均发生在第三方依赖编译阶段，未到达 `yingmu-core` 自身源码类型检查完成；Tauri/NSIS 安装包本阶段未生成。

## 备选方案

| 方案 | 未采用原因 |
| --- | --- |
| 组件内直接调用 `window.__TAURI__` / `fs` | 业务核心绑定平台 API，违背分层约束，且浏览器环境无法运行 |
| 用环境变量 / 条件编译在组件里分支 | 平台判断散落各处，接口不统一，难以保证一致性 |
| 只提供 `TauriBridge`，放弃浏览器运行 | 桌面端构建产物尚未产出时前端完全不可运行、不可测试 |
| 用 mock 框架在测试里打桩、无统一运行时实现 | 只能覆盖测试场景，无法提供浏览器 dev 下可真实运行/截图的演示应用 |
| 每个页面自行适配平台 | 重复实现、易漂移，无法保证命令名与类型一致 |
