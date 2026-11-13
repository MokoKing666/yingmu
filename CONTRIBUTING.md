# 贡献指南

感谢你参与影幕（YingMu）的代码审查与后续开发。

> **许可证尚未确定**：本仓库公开仅用于审查与协作，在许可证正式确定前，**未授权第三方复制、修改、分发代码或用于商业用途**。提交 PR 即表示你理解这一状态；贡献者的权利与后续许可安排将在许可证确定时另行说明。

---

## 1. 先读状态，再提改动

- `README.md` 的「当前交付状态」表：区分已实现、源码已提供、未验证、未交付。
- `docs/testing/strategy.md`：哪些检查真实跑过、哪些没有。
- `docs/adr/`：关键技术决策及其原因。**不要绕过 ADR 直接改核心架构。**

本项目严格区分「文件识别 / 元数据解析 / 解码 / 正确渲染 / 原生输出」五个能力层次。任何与 HDR、Dolby Vision、Dolby Audio、音频直通有关的 PR，必须附实机验证证据，不得仅凭读取到文件标识就宣称支持。

## 2. 开发环境

| 用途 | 要求 |
|---|---|
| 前端 | Node `^22.13 \|\| ^24 \|\| >=26`（`.nvmrc` = 26）、npm ≥ 10 |
| Rust / Tauri | stable `x86_64-pc-windows-msvc`、MSVC Build Tools、Windows 10/11 SDK、WebView2 |
| 安装包 | Tauri 2 NSIS Bundler（会自动下载 NSIS） |
| 截图复现 | 本机 Edge（Chromium 内核） |

```bash
npm ci
npm run dev
```

浏览器实例会自动使用 `WebDemoBridge`，不需要编译 Tauri 桌面端即可浏览 UI（桌面端构建产物非前端运行前提）。

## 3. 提交前必须通过

```bash
npm run typecheck        # TypeScript 严格检查
npm run lint             # ESLint（0 警告）
npm run test             # Vitest
npm run build            # 生产构建
npm run format:check     # Prettier
node scripts/secret-scan.mjs              # 凭据 / 私人路径扫描
node --test tests/repo-contract.test.mjs  # 仓库契约
```

具备完整 MSVC 链接器与 Windows SDK 后额外执行（本机当前**不具备**，见下）：

```bash
cargo fmt --all -- --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
```

Rust 1.99.1 已安装；本地已具备 MSVC 编译器/链接器与 Windows SDK 导入库/头文件（便携工具链，非系统级 Visual Studio 安装，需显式配置 `PATH` / `LIB` / `INCLUDE`）。`cargo fmt --all -- --check` 已通过（exit 0，格式已归一化）；`cargo check` / `cargo test` / `cargo clippy` 受构建环境限制未成功完成，仓库 Rust 代码仍未经完整编译与测试验证，所有 `#[cfg(test)]` 单元测试未运行。实际阻断有两类：默认 shell 中 Git Bash 的 `/usr/bin/link.exe`（GNU coreutils 硬链接命令）遮蔽 MSVC 链接器，报 `link: extra operand`；部分执行通道存在 safe-delete 删除拦截，cargo 清理 rlib 临时目录时返回 `拒绝访问 (os error 5)`。二者均发生在第三方依赖编译阶段，未到达 `yingmu-core` 自身源码类型检查完成。`node scripts/ci-local.mjs` 会按本机可执行范围汇总上述检查并明确标注跳过 / 失败原因，绝不静默当作成功；不得把「Rust 已安装」等同于「Rust 检查已通过」。

## 4. 代码规范

- **TypeScript**：`strict`、`noUnusedLocals`、`noUncheckedIndexedAccess`、`verbatimModuleSyntax` 全部开启；类型导入必须用 `import type`。
- **公共数据结构**：`packages/media-models/src/types.ts` 是唯一真源。任何字段变更必须同步 Rust 侧结构与 `docs/architecture/ipc-contract.md`，并写一份 ADR。
- **IPC**：命令名必须来自 `packages/media-models/src/bridge.ts` 的 `IPC` 常量，TS 与 Rust 两侧注册名完全一致，前缀 `yingmu_`。
- **平台隔离**：React 组件不得直接调用 `window.__TAURI__`、文件系统或任何平台 API；一律通过 `PlatformBridge`。Windows 专属实现不得进入业务核心。
- **播放器**：React 只依赖 `PlayerBackend` 抽象；未验证的能力返回 `verified: false`，不得填充占位数值或伪造解码统计。
- **样式**：数值来自 `@yingmu/design-tokens`，深浅主题用 CSS 变量，禁止散落魔法数字与硬编码颜色。
- **命名**：应用标识符固定 `com.moko.yingmu`；禁止使用任何临时标识符。
- **注释**：中文，解释「为什么」而不是复述代码。

## 5. 提交信息

采用 Conventional Commits，一条提交对应一个稳定模块，不把所有代码堆进一个巨大提交：

```
feat(ui): implement cinematic masonry wall
feat(media): add local media scanner
feat(player): integrate mpv backend
feat(installer): configure NSIS packaging
fix(player): correct playback state synchronization
test(media): add scanner integration tests
docs(dolby): clarify profile 8.1 verification status
```

提交信息必须准确反映真实完成的工作。不要写 `feat(player): add Dolby Vision support` 却只加了文件标识解析。

## 6. 安全红线

**严禁提交**：GitHub Token、API Key、密码、私钥、NAS 凭据、用户媒体库路径、真实播放记录、用户数据库、日志、私人测试视频、未授权字体或媒体素材、本机绝对路径。

- 密钥只能来自本地环境变量或安全配置存储；仓库只保留 `.env.example` 这样的占位文件。
- 不要把凭据写进 Git remote URL、CI 日志或提交信息。
- 提交前 `node scripts/secret-scan.mjs` 必须零命中。
- 用户数据固定存放 `%APPDATA%\YingMu` / `%LOCALAPPDATA%\YingMu`，绝不写安装目录。

## 7. 报告问题

- 缺陷 / 功能请求 / 播放兼容性：使用 `.github/ISSUE_TEMPLATE/` 对应模板。
- 播放与 HDR / Dolby 相关的问题请附：GPU 与驱动版本、Windows 版本、显示设备与接口、色彩设置、样本 Profile、观测结果与日志（日志需先脱敏）。
- 安全漏洞：按 `SECURITY.md` 私下报告，不要在公开 Issue 中贴出凭据或可利用细节。

## 8. 分支与发布

- 默认分支 `main`；功能分支从 `main` 切出，PR 需通过 CI 后合并。
- 版本 Tag 格式 `v0.3.2`，由 `.github/workflows/release.yml` 触发 Release 构建。
- Release 只允许上传当次工作流内刚构建并通过校验的产物；**不得把未完成功能标记为正式支持**。
