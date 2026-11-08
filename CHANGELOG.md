# 变更记录

本文件只记录**实际发生**的功能变更。计划中、未验证或仅提供接口的能力一律不写成「已支持」。

格式参考 Keep a Changelog，版本号遵循语义化版本。当前仓库许可证尚未确定，分发前请阅读根目录 `README.md` 的许可证说明。

---

## [0.3.0] - 2026-11-08

主题：**品牌视觉重设计、技术栈现代化与工程质量升级**。这一版没有加新功能页面，
目标是让 v0.2 的 Folia 拼贴在正确的品牌体系与正确的工具链上稳定运行。

### 品牌与视觉（Breaking：旧色板全部移除）

- **Cinematic Neutral 色系**：深色 Cinematic Graphite（底 `#0B0F14`、面 `#18222D`）、
  浅色 Silver Screen（底 `#F4F7FA`、面 `#EDF2F6`）、强调色 Glacier Blue（`#77B8D8`）。
  v0.2 的琥珀金 `#D9A55B`、暖白 `#F2EFE9`、米黄底 `#F7F6F3` **彻底删除**，
  `cinemaAmber` / `cinemaAmberSoft` / `silverScreen` 三个 token 不再存在。
- **浅色主题的强调色可访问性映射**：`#77B8D8` 在 `#F4F7FA` 上只有 2.2:1，
  浅色主题改用同色相加深的 `#3C6F8B`（实测 5.09:1）。组件只写 `var(--accent)`，
  由主题层决定实际值，因此不存在「两套品牌色」。
- **语义色与品牌色解耦**：收藏从琥珀金改为珊瑚红（深 `#DE8A82` / 浅 `#A84B44`），
  警告改为暖褐。深浅主题各一套，两套都必须过 4.5:1。
- **阴影重写**：`glow` 从金色光晕改为 Glacier Blue 冷光；深色主题改为双层阴影
  （近距实影 + 远距扩散），单层 `0 8px 24px` 在 4K 全屏下会显脏。
- **新增 `scripts/check-contrast.mjs`**：直接解析 `tokens.css` 计算 WCAG 2.2 AA 对比度，
  覆盖深浅两主题各 19 组配对（正文 4.5:1、焦点环与非文本 3:1）。
  当前结果：**0 项不达标**；最低值为浅色主题「成功色文字 / 页面背景」4.54:1。
- **修掉品牌迁移带出的新缺陷**：首页叠层标题 `.wall-overlay-title` 原本硬编码
  `var(--silver)`，在浅色主题下变成白底白字（实测 1.06:1）。改为 `var(--text-primary)`，
  并在浅色主题下去掉暗色描边。同类硬编码 `rgba(242,239,233,…)` 共 6 处，
  统一改为 `color-mix(in srgb, var(--silver) N%, transparent)`，不再残留旧色值。
- 应用图标按新品牌重绘（`npm run brand:icons`）。

### 工具链与依赖（全部为真实安装并通过 CI 验证的版本）

| 组件 | v0.2 | v0.3 | 说明 |
| --- | --- | --- | --- |
| Vite | 6.0 | **8.3.6** | Rolldown 内核；`manualChunks` 只支持函数形式；生产构建 5.5s → 1.3s |
| React / React DOM | 19.0 | **19.3.1** | — |
| TypeScript | 5.7 | **6.0.3** | `baseUrl` 弃用；副作用样式导入需 `vite/client` 类型 |
| Tailwind CSS | 4.0 | **4.3.5** | 与 `@tailwindcss/vite` 同步 |
| Motion | 12.0 | **14.10.1** | `motion/react` 入口不变 |
| Zustand | 5.0 | **5.1.0** | — |
| PixiJS | 8.6 | **8.22.0** | 动态背景 |
| Vitest | 3.0 | **5.1.0** | — |
| ESLint | 9.17 | **10.14.0** | 扁平配置；`@eslint/js` 版本号与本体不同步（`10.0.1`） |
| typescript-eslint | 8.18 | **8.72.1** | peer 要求 `typescript <6.1.0`，故 TS 7 不能作为正式基线 |
| eslint-plugin-react-hooks | 5.1 | **7.1.1** | 新增 `set-state-in-effect` 等规则 |
| @types/react | 19.0 | **19.3.0** | — |
| lucide-react | 0.468 | **1.70.0** | 大版本；图标名未变 |
| React Router | 7.1 | **7.18.5** | — |
| Node.js | ≥20.19 | **26 主线 / 24 兼容** | `engines: ^22.13 \|\| ^24 \|\| >=26`，`.nvmrc` = 26 |
| Rust MSRV | 1.82 | **1.85** | — |
| rusqlite | 0.32 | **0.41.1** | `features = ["bundled"]`；FTS5 由 CI `cargo test` 实测 |
| thiserror / sha2 / roxmltree | 1 / 0.10 / 0.20 | **2.0 / 0.11 / 0.21** | — |

升级原则：**没有使用 `--force`、`--legacy-peer-deps`，没有删除 lockfile，没有关闭 `strict`，
没有用 `skipLibCheck` 掩盖自己代码的错误，`any` 数量保持为 0。** `Cargo.lock` 已提交。

### 修复（v0.2 遗留的真实缺陷）

1. **媒体库排序被 `addedAt` 覆盖**：`wall-layout.ts` 无条件按 `addedAt` 重排，
   用户在「电影库」里选的评分 / 年份 / 名称排序在渲染层被抹掉。改为默认严格保留调用方顺序，
   只有拖拽产生的 `customOrder` 才排序。
2. **Hero 不是推荐第一名**：首页 hero 之前是「最早入库的那部」。新增
   `orderByRecommendation()`（`0.38*recency + 0.24*favorite + 0.2*resume + 0.18*rating`），
   确定性、无随机，用户一旦拖拽即完全尊重其顺序。
3. **真实媒体比例被演示素材污染**：`demoArtworkAspect` 以前参与所有磁贴的比例计算，
   真实影片也用演示素材的比例。新增 `media-aspect.ts`，优先级为
   `metadata.posterAspect` → 个人视频 `width/height` → 类型回退（纪录片 4:3，其余 2:3），
   **绝不用 Media ID 哈希编造比例**；`demoArtworkAspect` 只服务 WebDemoBridge。
4. **搜索栏遮挡第一排磁贴**：新增 `--header-safe: 76px` 顶部安全区，
   `max-height: 700px` 时收敛到 62px，窄高窗口不浪费画布。
5. **键盘焦点与虚拟化竞态**：磁贴还没挂载就 `focus()`，导致焦点丢失。改为
   `pendingFocusRef` + 在 `visible` 变化后的 effect 里消费，确保目标磁贴已挂载。
6. **`prefers-reduced-motion` 只覆盖 CSS、不覆盖 Motion**：`MediaTile` 与页面转场现在
   读 `useReducedMotion()`，关闭入场、悬停缩放与共享元素 `layoutId`。
7. **封面画质**：移除全局 `filter: brightness(1.55) saturate(1.2)`（它把暗部拉灰、
   把色相推向橙黄，与冷调品牌冲突）；悬停从 `scale(1.07)` 收敛到 `1.028`；
   取消依赖 opacity 过渡显示封面的做法——封面不再有半透明中间态。

### 安装器

- 版本号统一到 `0.3.0`（`package.json` ×2、`tauri.conf.json`、`Cargo.toml`、`Cargo.lock`），
  界面显示的版本改由构建期 `__APP_VERSION__` 注入，避免「设置里写 v0.2.0、包里写 0.1.0」。
- NSIS 双安装模式（`installMode: both`）保持不变：同一个安装器提供「仅为我安装 / 为所有人安装」
  与目录选择页。`docs/installation/nsis.md` 修正了「仅为我安装不需要管理员」与
  「启动即 UAC」的矛盾表述——**两种范围启动安装器都要 UAC**（提权用于写安装目录、
  写卸载信息与注册表），而**应用本体始终以普通用户权限运行**。

### 未完成 / 未验证（不得当成已完成）

- **NSIS 安装包未做交互式安装测试**：范围选择、UAC 提示、多用户数据隔离、覆盖升级、
  卸载残留均需人工在真实 Windows 上走一遍。
- **真实 Windows 显示缩放（125% / 150% / 200%）未人工确认观感**；
  性能报告中的缩放档位是**逻辑视口模拟**（缩小 `--window-size`），不是 DPI 验证。
- libmpv 播放后端仍未集成；HDR10 / Dolby Vision / Dolby Audio / 音频直通均未验证。
- 浅色主题的封面观感（暗调素材在浅底上的对比）只做了截图目视检查，
  没有做用户可用性测试。

---

## [0.2.0] - 2026-11-08

### 变更（UI 重构）

- **重写布局引擎**：`wall-layout.ts` 从「12 列 CSS Grid + 六种固定跨度」改为
  **确定性 Skyline 二维装箱**，输出连续像素尺寸与绝对坐标。尺寸由权重连续计算，
  同时存在超大横幅、超大竖版、宽幅、方形与不规则比例；零重叠、可复现、
  支持自定义排序与窗口缩放重排。决策记录见 `docs/adr/0007-folia-mosaic-engine.md`。
- **全幅延展**：幕墙页取消左右 40px 固定留白（`.page-scroll.is-fullbleed`），
  磁贴延伸到应用内容区边缘；页面背景与画布自然融合，无水平滚动条。
- **导航重构**：取消 232px 固定侧栏，改为默认折叠的悬浮轨道（`.nav-rail`）+
  浮层抽屉（`.nav-drawer`）；`[` / `Ctrl+B` 呼出，`Esc` 收起，不挤压画布。
- **顶栏悬浮化**：搜索与工具改为右上角悬浮胶囊，不占画布高度；首页标题改为轻量叠加。
- **可见区域虚拟化**：`MasonryWall` 按滚动区间 + overscan 只挂载可见磁贴，
  1000 条数据时首屏仅挂载 18 个（旧实现按批追加，最终会挂满 DOM）。
- **48 张原创演示封面**：`scripts/generate-demo-artwork.mjs` 程序化生成 48 张
  不同题材/比例/调色的场景插画（2:3、16:9、4:3、1:1、5:4、4:5、3:2），
  替换旧的重复圆环/横线占位图；演示数据从 28 条扩展到 52 条。
- **封面焦点可调**：媒体详情页新增九宫格焦点控件，`object-position` 按焦点裁剪，
  不同宽高比磁贴不拉伸变形；焦点持久化到本地存储。
- **动画重做**：层次化入场延迟、悬停放大、共享元素 `layoutId`、页面转场；
  用内层 Motion + 外层 CSS transform 分层，避免与定位冲突；尊重减少动效设置。

### 修复

- `apps/desktop/src-tauri/Cargo.toml` 补上 `chrono = { workspace = true }`，
  修复 Windows CI 的 `error[E0433]: cannot find module or crate 'chrono'`。
- `tauri.conf.json` 的 `installMode` 从 `currentUser` 改为 `both`，
  同一个 NSIS 安装器支持「仅为我安装」与「为所有人安装」，含范围页与目录页。
- 布局引擎补齐「凹口适配宽度」候选，消除超大横幅右侧的大面积空洞。

### 新增文档

- `docs/adr/0007-folia-mosaic-engine.md`（布局引擎选型与备选方案）
- `docs/installation/nsis.md`（双安装范围、UAC、注册表、用户数据分离、验证状态）
- `docs/testing/performance-report.md`（40/200/500/1000 条与四种分辨率的实测数据）

### 未完成 / 未验证

- **NSIS 安装包已由 CI 真实构建**：`yingmu-nsis-installer`（`YingMu-Setup-0.1.0-x64.exe`，4.42 MiB，
  SHA-256 `272ec58f126b2c665734b530afec7ea247eb1a68f33d0372e4b072ff31b22e5e`；NSIS 打包含时间戳，**构建不可复现**，哈希以 Artifact 内 `SHA256SUMS.txt` 为准），
  CI run [42474963471](https://github.com/MokoKing666/yingmu/actions/runs/42474963471)；
  **交互式安装测试（范围选择、UAC、多用户数据隔离、覆盖升级、卸载）尚未执行**。
- libmpv 仍未集成；原生视频 Surface、HDR/Dolby Vision/Dolby Audio 输出仍未验证。
- 真实 Windows 显示缩放（125%/150%/200%）下的观感需人工在桌面端确认；
  当前报告用的是逻辑视口模拟。

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
- GitHub 源码推送 **已完成**；GitHub Actions 首次实跑：前端 `typecheck / lint / test / build` 通过，Rust `fmt / clippy / cargo test`（81 用例）通过，Windows NSIS 构建结果见仓库 Actions 页面。云端 CI 发现并修复的问题：clippy 三项告警、`@types/node` 缺失、并行测试临时目录冲突、LRU 时间基准混用、截断文件指纹 EOF。
- 全新安装 / 覆盖升级 / 卸载 / 数据保留的安装测试 **未执行**。

### 已知问题

- 本机 npm registry 一度被配置为国内镜像并出现 SSL 错误；必要时在命令后附加 `--registry=https://registry.npmjs.org`。仓库不硬编码 registry。
- Vite 构建提示 PixiJS 分包超过 500 kB（已独立分包，不影响功能）；后续可进一步按需动态导入。
- 浏览器演示模式下的媒体条目、封面与进度均为原创虚构演示数据，UI 有「演示数据」角标；接入 TauriBridge 后由真实扫描器替换。
- `docs/testing/strategy.md` 记录每项测试的真实执行状态；不得把「源码已提供」当作「测试已通过」。Rust 1.99.1 已安装；本地已具备 MSVC 编译器/链接器与 Windows SDK 导入库/头文件（便携工具链，非系统级 Visual Studio 安装，需显式配置 `PATH` / `LIB` / `INCLUDE`）；`cargo fmt --all -- --check` 已通过（exit 0，格式已归一化）；`cargo check` / `cargo test` / `cargo clippy` 受构建环境限制未成功完成，仓库 Rust 代码仍未经完整编译与测试验证，所有 `#[cfg(test)]` 单元测试未运行。实际阻断有两类：默认 shell 中 Git Bash 的 `/usr/bin/link.exe`（GNU coreutils 硬链接命令）遮蔽 MSVC 链接器，报 `link: extra operand`；部分执行通道存在 safe-delete 删除拦截，cargo 清理 rlib 临时目录时返回 `拒绝访问 (os error 5)`。二者均发生在第三方依赖编译阶段，未到达 `yingmu-core` 自身源码类型检查完成。

---

## [Unreleased]

暂无已合并的变更。后续工作应优先补齐：MSVC 工具链 → Tauri/NSIS 构建 → libmpv 原生 Surface 技术验证 → 真实媒体扫描与刮削 → 安装测试 → GitHub 授权后的首次 CI 与 Release。
