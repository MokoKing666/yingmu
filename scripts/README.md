# 影幕 YingMu — 运维与 QA 脚本说明

本目录脚本均为 ESM（`.mjs`），只依赖 Node 内置模块与仓库自带脚本，不需要额外安装第三方包即可运行。它们服务于「提交前检查、产物校验、本机 CI 汇总、仓库契约测试」。

## 环境差异（务必先读）

| 项目 | 本机（当前开发机） | GitHub Actions |
| --- | --- | --- |
| Node 22 / npm 10 | 可用 | 由 `actions/setup-node@v4` 在 ubuntu-latest / windows-latest 提供 |
| 前端依赖 `node_modules` | 已安装（前端 6 项检查本机全部通过） | 由 `npm ci` 安装（要求仓库含 `package-lock.json`） |
| Rust / Cargo | **Rust 1.99.1 已安装**（`~/.cargo/bin`，cargo / rustc / rustfmt / clippy 齐全），但不在自动化 shell 默认 `PATH`；`ci-local.mjs` 会自动回退并把该目录前置到子进程 `PATH` | `dtolnay/rust-toolchain@stable` 提供 |
| MSVC / Windows SDK | **已就位**（便携工具链：cl.exe / link.exe + SDK 导入库/头文件/rc.exe），需显式配置 `PATH` / `LIB` / `INCLUDE` | windows-latest 自带 |
| WebView2 | 可用 | Windows runner 自带 |
| `cargo fmt` | **可本机真实执行**（只需 Rust 工具链，不触发链接） | ubuntu-latest 的 `rust` job 执行 |
| `cargo clippy` / `cargo test` | 受构建环境限制**未在本机成功完成**，明确跳过 | ubuntu-latest 的 `rust` job 执行 |
| Tauri 桌面端编译 / NSIS 打包 | **本阶段未生成** | windows-latest 由 `tauri-apps/tauri-action@v1` 执行 |
| gh CLI / GitHub 认证 | 连接器已认证为 `MokoKing666` 但 App 无建仓权限（403）；`gh` CLI 不存在；`~/.git-credentials` 不存在；本地凭据文件失效（401）；`git ls-remote` 不可达（代理 502），仅 `api.github.com` 直连可达 | 通过 GitHub Actions 的 secrets 上下文注入内置令牌 |

结论：本目录脚本覆盖「Node 内置即可运行」的检查，外加只需 Rust 工具链的 `cargo fmt`（本机可真实执行并通过）。`cargo clippy` / `cargo test` 受构建环境限制在本机未成功完成，Tauri 桌面端编译与 NSIS 安装包打包本阶段未生成——这些由 `ci-local.mjs` 明确列为「跳过」并打印准确原因，绝不静默当作成功。GitHub Actions 工作流无法在本机运行；本次对 `ci.yml` / `release.yml` 的 NSIS 产物命名规范化属于静态修补，**未在 GitHub runner 实跑**。完整的 `frontend` / `rust` / `windows-installer` 三个 job 只在 GitHub Actions 上真实执行，本机结果不得被当作 CI 全部通过的证明。

另外，Release 工作流由 `push.tags: ['v*']` 触发，并创建 GitHub Release；本机未产出安装包，因此完整 Release 流程同样只存在于 CI。

---

## 脚本清单

### `scripts/secret-scan.mjs`

提交前敏感信息扫描。递归扫描仓库内将被提交的文件（排除 `node_modules`、构建产物、用户数据等目录），检测：

- GitHub 各类访问令牌前缀（个人 / 细粒度 / OAuth / 应用令牌）
- AWS 访问密钥 ID
- 私钥 PEM 块
- 疑似 `.env` 凭据文件（按文件名，白名单允许 example / sample / template）
- 常见凭据赋值（变量名后跟等号或冒号、且值为引号包裹的较长串）
- Windows 盘符绝对路径与 UNC 网络路径（仅针对配置 / 文档 / 数据类文件；源码
  `.ts` / `.rs` / `.mjs` 等里的示例路径属于程序逻辑与测试数据，不判定）
- 私人媒体 / 字幕样本文件、私钥与凭据文件（按文件名后缀；`.ts` 是 TypeScript
  源码后缀，不作为媒体后缀，避免误伤）

所有敏感特征串都用字符拼接构造，避免脚本扫描自身时自匹配；GitHub Actions 表达式会先被剔除，避免把 secrets 引用误报为真实凭据。命中片段在报告中脱敏，不会打印完整疑似密钥。路径类规则还放行注释与单元测试断言中的路径示例；可用 `--root` 指向只含脚本自身的目录验证零自匹配。

| 项 | 说明 |
| --- | --- |
| 参数 | `[仓库根目录]`（可选，默认脚本所在仓库根）、`--help` / `-h` |
| 退出码 | `0` 未发现命中；`1` 发现命中，禁止提交；`2` 参数或运行错误 |
| 示例 | `node scripts/secret-scan.mjs` |

### `scripts/verify-release.mjs`

安装包发布校验闸门。校验一个 Windows NSIS 安装包：文件存在且为普通文件、体积严格大于 1MB、文件头两字节为 `MZ`（PE 可执行文件），并计算 SHA-256。CI / Release 工作流在上传产物前调用它，校验失败即阻断发布。

| 项 | 说明 |
| --- | --- |
| 参数 | `<安装包路径>`（必填）、`--sums <输出文件>`（可选）、`--help` |
| `--sums` | 校验通过后写出标准 sha256sum 格式的一行：`<hex>  文件名`，用于生成 `SHA256SUMS.txt` |
| 退出码 | `0` 校验通过；`1` 校验失败，禁止发布；`2` 参数错误 |
| 示例 | `node scripts/verify-release.mjs release-assets/YingMu-Setup-0.1.0-x64.exe --sums release-assets/SHA256SUMS.txt` |

### `scripts/ci-local.mjs`

本机可执行范围内的 CI 汇总。按根 `package.json` 脚本顺序依次尝试：`typecheck` → `lint` → `test` → `build` → `secret-scan` → 仓库契约测试 → `cargo:fmt` / `cargo:clippy` / `cargo:test`。

执行前会探测：前端依赖是否已安装、本机是否有可用 Cargo（先试默认 `PATH`，失败回退到 `%USERPROFILE%\.cargo\bin` / `~/.cargo/bin` 并把该目录前置到子进程 `PATH`）、MSVC/Windows SDK 链接器是否可用。依赖或工具链缺失的项目会被**明确跳过并打印准确原因**（`cargo fmt` 可执行并真实执行；`cargo clippy` / `cargo test` 受构建环境限制跳过；Tauri/NSIS 构建仅在 CI 的 windows-latest 执行），绝不静默当作成功；末尾给出「通过 / 失败 / 跳过」汇总。

| 项 | 说明 |
| --- | --- |
| 参数 | 无（固定以仓库根目录为工作目录） |
| 退出码 | `0` 本机已执行的检查全部通过；`1` 存在失败项 |
| 示例 | `node scripts/ci-local.mjs` |

### `tests/repo-contract.test.mjs`

仓库契约测试（不在本目录，位于 `tests/`）。使用 `node:test`，零第三方依赖。校验 App ID 一致性、旧标识禁令、IPC 命令前缀与唯一性、`.gitignore` 关键规则、CI / Release 工作流必要步骤。对并行开发中尚未创建的文件给出 skip / diagnostic，一旦存在则严格校验。

| 项 | 说明 |
| --- | --- |
| 运行方式 | `node --test tests/repo-contract.test.mjs` |
| 退出码 | `0` 全部通过；非 `0` 存在失败 |

---

## 建议的提交前顺序

```bash
node scripts/secret-scan.mjs
node --test tests/repo-contract.test.mjs
node scripts/ci-local.mjs
```

具备完整工具链时再补跑根 `package.json` 中的 `format:check`、`cargo:fmt`、`cargo:clippy`、`cargo:test`，以及 Windows 安装包构建。

## 不在本目录说明范围

- `scripts/generate-icons.mjs` 由总架构师维护，本目录不创建、不覆盖、不描述其行为。
- `.github/workflows/ci.yml` 与 `.github/workflows/release.yml` 的说明以工作流内注释为准。
- 本目录文档只描述脚本契约；不得在此粘贴任何密钥、令牌、本机绝对路径或私人媒体样本。
