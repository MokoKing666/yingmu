# 变更记录

本文件只记录**实际发生**的功能变更。计划中、未验证或仅提供接口的能力一律不写成「已支持」。

格式参考 Keep a Changelog，版本号遵循语义化版本。当前仓库许可证尚未确定，分发前请阅读根目录 `README.md` 的许可证说明。

---

## [0.1.0] - 2026-11-06

首个工程基线版本。目标是建立可持续审查、可构建、可迭代的正式工程结构与可真实运行的前端，而不是交付一个已完成的商业媒体中心。

### 新增

#### 工程与品牌
- 建立 monorepo 结构：`apps/desktop`、`crates/yingmu-core`、`packages/*`、`assets/branding`、`docs/*`、`scripts`、`tests`、`.github/workflows`。
- 统一应用标识符 `com.moko.yingmu`，版本 `0.1.0`，Rust crate `yingmu-core`，目标 `x86_64-pc-windows-msvc`。
- 手工设计原创 SVG Logo 全套：主 Logo、独立图形、横向组合、深色背景适配版、浅色背景适配版、应用图标源。
- 生成 PNG 多尺寸（16–1024）与多尺寸 Windows ICO，脚本 `scripts/generate-icons.mjs` 可从 SVG 源重建。
- 建立统一 Design Tokens：字体栈、深浅双色板、圆角、间距、阴影、磁贴尺寸层次、动效参数、层级。
- 严格 `.gitignore`：排除密钥、用户数据、私人媒体、构建产物、系统字体二进制；特别避免 `*.ts` 误伤 TypeScript 源码。

#### 前端（已真实运行）
- React 19 + TypeScript 严格模式 + Vite 6 + Tailwind CSS 4 + Motion + Zustand 5 + PixiJS 8 + React Router 7。
- Folia 式不规则磁贴幕墙：12 列 dense 网格、6 种磁贴形态、悬停与缩放、拖拽排序、键盘导航、页面转场、`layoutId` 共享元素声明。
- PixiJS 8 动态光影背景，WebGL 不可用或「减少动态效果」时自动降级为 CSS 渐变。
- 性能策略：分批增量渲染、IntersectionObserver 封面懒加载、浏览器 `content-visibility` 离屏跳过、Artwork 内存缓存与重建。
- 16 个页面：首页、5 个媒体库、最近播放、收藏、播放列表、搜索、媒体详情、媒体源管理、播放器、播放历史、设置、媒体信息编辑；各页采用不同信息结构。
- 完整深色与浅色主题，支持跟随系统，支持 `?theme=light|dark` URL 覆盖（用于截图与分享）。
- `PlatformBridge` 抽象：`WebDemoBridge`（原创演示数据 + localStorage 持久化）与 `TauriBridge`（类型安全 IPC）可替换。
- 稳定 Media ID：内容指纹派生，路径不参与计算；支持多版本、收藏 / 元数据 / 观看记录跨源保留。
- 播放器控制界面：进度、倍速、音量、音轨、字幕、章节、播放列表、全屏、视频信息面板；**明确标注后端未集成，不伪造时间推进或解码统计**。
- 状态提示组件：所有未实现 / 未验证能力在 UI 中直说。

#### 接口与数据模型
- `packages/media-models`：全项目共享类型 + `IPC` 命令常量 + `PlatformBridge` / `AppSettings` / `DiagnosticsReport`。
- `packages/player-api`：`PlayerBackend` 抽象、状态机、命令、解码统计结构，以及 5 层能力模型（identified → metadata-parsed → decoded → rendered → native-output）。

#### Rust / 桌面端（源码已落地，未经编译验证，状态以 `docs/testing/strategy.md` 为准）
- `crates/yingmu-core`：Provider、Scanner、Metadata、Database（迁移 + FTS5）、Artwork、Network、Player、Subtitles、History、Diagnostics 模块与单元测试源码。
- `apps/desktop/src-tauri`：Tauri 2 配置（标识符、NSIS 简体中文、WebView2、图标）、命令层、能力配置。
- `native/windows`：原生视频 Surface 技术验证说明。

#### 测试与 CI
- Vitest 6 个测试文件 / 50 个用例：格式化、稳定 Media ID、幕墙布局、Artwork 缓存、WebDemoBridge 行为与诚实性约束、React 组件渲染。
- `tests/repo-contract.test.mjs`：App ID 一致性、旧标识禁用、IPC 命名、`.gitignore` 回归、CI 步骤完整性。
- `scripts/secret-scan.mjs`：凭据与私人路径扫描，含注入样本自检。
- `scripts/verify-release.mjs`：安装包存在性 / 体积 / PE 头 / SHA-256 校验。
- `scripts/capture-screenshots.mjs`：调用本机 Edge 无头模式截取真实运行界面。
- `.github/workflows/ci.yml`：前端 npm ci / typecheck / lint / test / build；Rust fmt / clippy / test；Windows NSIS 构建与产物校验；artifact 上传。
- `.github/workflows/release.yml`：版本 Tag 触发 Release 构建、校验、SHA-256、变更记录与安装器上传。
- Issue 模板（缺陷 / 功能 / 播放兼容性实机验证）与 PR 模板。

#### 文档
- 架构总览、IPC 契约、Media ID 设计、设计系统、播放器接口、Windows Surface 验证报告、字幕与音频、数据库 schema、测试策略、6 份 ADR。
- Dolby Vision / Dolby Audio / HDR 分层兼容性矩阵，明确区分文件识别与原生输出，明确未认证。
- `THIRD_PARTY_NOTICES.md`：第三方依赖与 GPL / LGPL / 专利 / 商标 / Dolby 授权专项审查。
- README 中的界面截图全部来自 `vite preview` 真实运行实例。

#### 本机验证结果（2026-11-06，实测通过）

| 检查 | 实测结果 |
| --- | --- |
| `npm run typecheck` | ✅ 通过（TypeScript 严格模式） |
| `npm run lint` | ✅ 通过（ESLint 0 警告） |
| `npm run test` | ✅ 通过（6 个测试文件 / 50 个用例全部通过） |
| `npm run build` | ✅ 通过（Vite 产出 `apps/desktop/dist`） |
| `node scripts/secret-scan.mjs` | ✅ 通过（扫描 168 个文件，未发现敏感信息） |
| `node --test tests/repo-contract.test.mjs` | ✅ 通过（6/6） |

Rust 侧检查**未全部通过**，如实记录：Rust 1.99.1 已安装；本地已具备 MSVC 编译器/链接器与 Windows SDK 导入库/头文件（便携工具链，非系统级 Visual Studio 安装，需显式配置 `PATH` / `LIB` / `INCLUDE`）。`cargo fmt --all -- --check` 已通过（exit 0，格式已归一化）；`cargo check` / `cargo test` / `cargo clippy` 受构建环境限制未成功完成，仓库 Rust 代码仍未经完整编译与测试验证，所有 `#[cfg(test)]` 单元测试未运行。实际阻断有两类：默认 shell 中 Git Bash 的 `/usr/bin/link.exe`（GNU coreutils 硬链接命令）遮蔽 MSVC 链接器，报 `link: extra operand`；部分执行通道存在 safe-delete 删除拦截，cargo 清理 rlib 临时目录时返回 `拒绝访问 (os error 5)`。二者均发生在第三方依赖编译阶段，未到达 `yingmu-core` 自身源码类型检查完成。

### 未实现 / 未验证（本版本明确不作为功能宣称）

- Windows NSIS 安装包 `YingMu-Setup-0.1.0-x64.exe` **未生成**：**本阶段未生成**，交付安装包由 CI / Release 工作流在 `windows-latest` 上构建并把关。`cargo fmt --all -- --check` 已通过（exit 0，格式已归一化）；`cargo check` / `cargo test` / `cargo clippy` 受构建环境限制未成功完成，仓库 Rust 代码仍未经完整编译与测试验证，所有 `#[cfg(test)]` 单元测试未运行。实际阻断有两类：默认 shell 中 Git Bash 的 `/usr/bin/link.exe`（GNU coreutils 硬链接命令）遮蔽 MSVC 链接器，报 `link: extra operand`；部分执行通道存在 safe-delete 删除拦截，cargo 清理 rlib 临时目录时返回 `拒绝访问 (os error 5)`。二者均发生在第三方依赖编译阶段，未到达 `yingmu-core` 自身源码类型检查完成。
- libmpv 集成、D3D11 + 原生 HWND Surface 嵌入 WebView2、4K HEVC / HDR 输出实机验证 **均未完成**。
- Dolby Vision Profile 5 / 7 / 8.1、RPU、Enhancement Layer、HDR10 回退、SDR 色调映射 **未实机验证**；Dolby Audio / Atmos / bitstream 直通 **未验证**；未获得 Dolby 官方认证。
- TMDB / NFO 刮削、SMB / WebDAV 实际连接、真实文件扫描 **未在本机验证**。
- GitHub 源码推送 **已完成**：仓库 `https://github.com/MokoKing666/yingmu` 已于 2026-11-08 创建为公开仓库并完成源码推送。本机 `git push` 通道不可达（`github.com:443` 直连超时、代理返回 502），故改用 `api.github.com` 直连：该 classic PAT 只接受 `Basic 用户名:token` 认证（`Bearer` / `token` 写法返回 401 `Bad credentials`，属鉴权写法差异，并非凭据失效），经 GitHub REST / Git Data API 分 7 个提交推送全部 173 个文件（含 24 个 PNG/ICO 二进制），**逐文件 blob SHA 校验 173/173 完全一致**；凭据仅从本地文件读入内存用于鉴权，未写入代码、提交、remote URL 或日志。GitHub Actions 已由推送触发（结果见仓库 Actions 页面）；GitHub Release **未创建**（需推送 `v*` Tag）。
- 全新安装 / 覆盖升级 / 卸载 / 数据保留的安装测试 **未执行**。

### 已知问题

- 本机 npm registry 一度被配置为国内镜像并出现 SSL 错误；必要时在命令后附加 `--registry=https://registry.npmjs.org`。仓库不硬编码 registry。
- Vite 构建提示 PixiJS 分包超过 500 kB（已独立分包，不影响功能）；后续可进一步按需动态导入。
- 浏览器演示模式下的媒体条目、封面与进度均为原创虚构演示数据，UI 有「演示数据」角标；接入 TauriBridge 后由真实扫描器替换。
- `docs/testing/strategy.md` 记录每项测试的真实执行状态；不得把「源码已提供」当作「测试已通过」。Rust 1.99.1 已安装；本地已具备 MSVC 编译器/链接器与 Windows SDK 导入库/头文件（便携工具链，非系统级 Visual Studio 安装，需显式配置 `PATH` / `LIB` / `INCLUDE`）；`cargo fmt --all -- --check` 已通过（exit 0，格式已归一化）；`cargo check` / `cargo test` / `cargo clippy` 受构建环境限制未成功完成，仓库 Rust 代码仍未经完整编译与测试验证，所有 `#[cfg(test)]` 单元测试未运行。实际阻断有两类：默认 shell 中 Git Bash 的 `/usr/bin/link.exe`（GNU coreutils 硬链接命令）遮蔽 MSVC 链接器，报 `link: extra operand`；部分执行通道存在 safe-delete 删除拦截，cargo 清理 rlib 临时目录时返回 `拒绝访问 (os error 5)`。二者均发生在第三方依赖编译阶段，未到达 `yingmu-core` 自身源码类型检查完成。

---

## [Unreleased]

暂无已合并的变更。后续工作应优先补齐：MSVC 工具链 → Tauri/NSIS 构建 → libmpv 原生 Surface 技术验证 → 真实媒体扫描与刮削 → 安装测试 → GitHub 授权后的首次 CI 与 Release。
