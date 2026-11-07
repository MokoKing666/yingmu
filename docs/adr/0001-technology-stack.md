# ADR 0001：技术栈选型

| 项 | 内容 |
| --- | --- |
| 编号 | 0001 |
| 日期 | 2026-11-06 |
| 状态 | **已接受** |
| 相关 | `0002-platform-bridge`、`0004-player-backend`、`docs/architecture/overview.md` |

## 状态

已接受。技术栈骨架与契约已建立；**Rust 平台层源码（`crates/yingmu-core/**`、`apps/desktop/src-tauri/**`）已落地，但未经编译验证**（本地工具链已就位，受构建环境限制未完成完整编译与测试）；播放器后端 libmpv 未集成、未验证，见「后果」与 `docs/architecture/overview.md`。

## 背景

- 产品「影幕 YingMu」（App ID `com.moko.yingmu`，v0.1.0）首发 Windows 10 22H2 / Windows 11 x64，目标是 Folia 式磁贴幕墙 + Infuse 级媒体管理 + 可靠的原生播放体验。
- 需要高自由度 UI（不规则磁贴、动效、动态背景）、本地媒体库与全文检索、以及专业级播放（HDR / 多声道 / 字幕）。
- 本机实测环境：Node 22.22.2 / npm 10.9.7、`node_modules` 已安装、Git 2.55、WebView2 156.0.4314.58、网络可用；**Rust 1.99.1 已安装；本地已具备 MSVC 编译器/链接器与 Windows SDK 导入库/头文件（便携工具链，非系统级 Visual Studio 安装，需显式配置 `PATH` / `LIB` / `INCLUDE`）**。由此得出结论：**Tauri/NSIS 安装包本阶段未生成，由 CI / Release 在 `windows-latest` 构建；`cargo fmt --all -- --check` 已通过（exit 0，格式已归一化）；`cargo check` / `cargo test` / `cargo clippy` 受构建环境限制未成功完成，仓库 Rust 代码仍未经完整编译与测试验证，所有 `#[cfg(test)]` 单元测试未运行。实际阻断有两类：默认 shell 中 Git Bash 的 `/usr/bin/link.exe`（GNU coreutils 硬链接命令）遮蔽 MSVC 链接器，报 `link: extra operand`；部分执行通道存在 safe-delete 删除拦截，cargo 清理 rlib 临时目录时返回 `拒绝访问 (os error 5)`。二者均发生在第三方依赖编译阶段，未到达 `yingmu-core` 自身源码类型检查完成**。
- 需要一种让前端在**尚未产出 Tauri 桌面端构建产物**的环境下仍可独立开发、测试、截图的组织方式（见 0002）。

## 决策

采用如下分层技术栈（来自根 `package.json` 与 `apps/desktop/package.json`）：

| 层次 | 选型 |
| --- | --- |
| 前端框架 | React 19 + TypeScript + Vite 6 |
| 样式 / 动效 / 图形 | Tailwind CSS 4、Motion、PixiJS 8 |
| 状态 / 路由 / 图标 | Zustand、react-router 7、lucide-react |
| 桌面外壳 | Tauri 2 + Rust + WebView2（Windows） |
| 数据 | SQLite + FTS5 + 版本化迁移 |
| 播放器目标后端 | libmpv（**本阶段未集成、未验证**） |
| 工程组织 | npm workspaces（`apps/*`、`packages/*`），Node `>=20.19.0` |

分层约束：业务核心（`packages/media-models`、`packages/player-api`、`packages/design-tokens`）为纯 TypeScript，不含 `window` / `fs` / `tauri` 等平台引用；Windows 专属实现（D3D11、HWND Surface、WASAPI、WebView2、NSIS）只留在平台层。

## 后果

正面：

- 前端可独立于 Tauri 桌面端编译运行（Vite + `WebDemoBridge`），开发/测试/截图不受平台链接条件限制。2026-11-06 本机实测已验证：`npm run typecheck`、`npm run lint`、`npm run test`（6 个测试文件 / 50 个用例）、`npm run build`、凭据扫描（168 文件零命中）、仓库契约测试（6/6）全部通过；界面截图来自 `vite preview` 真实运行实例（见 README「界面截图」章节）。
- 纯 TS 契约层作为唯一真源，TS 与 Rust 模型/命令可一一对应，便于跨语言一致性检查。
- WebView2 随系统提供，避免打包庞大浏览器运行时。

负面 / 待解决：

- **Rust 源码已落地（含 `Cargo.toml` 与 SQL 迁移），但受构建环境限制仍未经编译验证。** `cargo fmt --all -- --check` 已通过（exit 0，格式已归一化）；`cargo check` / `cargo test` / `cargo clippy` 受构建环境限制未成功完成，仓库 Rust 代码仍未经完整编译与测试验证，所有 `#[cfg(test)]` 单元测试未运行。实际阻断有两类：默认 shell 中 Git Bash 的 `/usr/bin/link.exe`（GNU coreutils 硬链接命令）遮蔽 MSVC 链接器，报 `link: extra operand`；部分执行通道存在 safe-delete 删除拦截，cargo 清理 rlib 临时目录时返回 `拒绝访问 (os error 5)`。二者均发生在第三方依赖编译阶段，未到达 `yingmu-core` 自身源码类型检查完成。Tauri/NSIS 安装包本阶段未生成。
- **libmpv 目标后端未集成、未验证**；D3D11 + 原生 HWND Surface 嵌入、4K HEVC / HDR / DV 输出、音频 bitstream 均未实机验证。
- 目标仓库 `MokoKing666/yingmu` 经已认证接口确认 404（账号下 8 个公开仓库中无同名或 `yingmu-player`，无覆盖风险）；GitHub 连接器已认证为 `MokoKing666`，但其 GitHub App 无「创建仓库」权限（403）；本机 `git push` 通道不可达（`github.com:443` 直连超时、代理返回 502），仅 `api.github.com` 直连可达；用户提供的本地凭据文件为标准格式的 classic PAT，但实测 `GET /user` 返回 401（凭据已失效）——其**内容未被读取输出，也未写入任何代码、提交、remote URL 或日志**。完整源码已打包为 git bundle 并保留全部提交历史，待有效凭据就绪后可一键推送；**GitHub 尚未推送**；CI 与 Release 未实跑。
- 所有能力声明以实机证据为准；「未验证」不等于「不支持」，但**不得据此宣称支持**（见 `docs/dolby-compatibility/*`）。
- 第三方依赖许可证与 Dolby/DTS 商标、专利、字体授权需专项审查（见 `THIRD_PARTY_NOTICES.md`、`0006-license-status.md`）；项目自身开源许可证尚未确定。

## 备选方案

| 方案 | 未采用原因 |
| --- | --- |
| Electron | 体积与资源占用更大，且需打包完整 Chromium；WebView2 在目标 Windows 平台已可用 |
| 原生 WinUI 3 / Win32 | UI 表现力与动效开发成本高，难以复用 Web 生态与磁贴/动画能力 |
| .NET / MAUI | 与既有 Web 前端技术栈不一致，跨平台抽象收益有限 |
| 纯 Web 应用 + 系统外部播放器 | 无法满足「嵌入式原生播放」要求，且禁止用独立外部窗口冒充嵌入式播放 |
| 仅用 Tauri、不做前端独立运行路径 | 桌面端构建产物尚未产出时前端完全无法运行，违背可开发与可测试要求 |
