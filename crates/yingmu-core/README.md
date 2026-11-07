# yingmu-core — 影幕 YingMu 媒体核心

> **本模块源码未经编译验证，不得视为可运行实现：Rust 工具链 1.99.1 已安装（未在 PATH），但 MSVC / Windows SDK / link.exe 缺失。**
>
> 目标三元组为 `x86_64-pc-windows-msvc`。以下所有 Rust 代码均按 crates.io 稳定版
> API 与项目接口契约编写，但**未能成功完成** `cargo check` / `cargo test` /
> `cargo clippy`（已尝试，详见「运行前提」）。不得据此声称：libmpv 已集成、
> NSIS 已构建、HDR/Dolby 已验证、测试已通过。

## 模块清单

| 模块 | 职责 | 状态 |
| --- | --- | --- |
| `lib.rs` | `CoreError` / `Result` / 版本常量 / 模块导出 / 应用标识符 | 纯逻辑 |
| `database/models.rs` | 跨语言数据模型（与 `packages/media-models/src/types.ts`、`bridge.ts` 字段一一对应） | 纯逻辑 |
| `providers/mod.rs` | `MediaProvider` trait、`LocalProvider`（本地磁盘 + UNC）、`SmbProvider`/`WebDavProvider` 骨架、`ProviderRegistry` | Local 已实现；SMB/WebDAV **未验证** |
| `scanner/mod.rs` | 递归扫描、视频扩展名、部分内容指纹、去重、增量、断点游标、删除/移动检测、可取消、进度事件、`MediaProbe` 抽象 | 纯逻辑已实现；**无 FFmpeg 绑定，不返回任何探测结果** |
| `metadata/mod.rs` | NFO 解析（roxmltree）、TMDB HTTP 结构、匹配/手动修正、刮削失败回退 | 纯逻辑已实现；在线 HTTP 传输需平台层注入 |
| `database/mod.rs` | 连接管理、版本化迁移、UUID v5 Media ID、FTS5 搜索与分页、CRUD | SQLite 逻辑已实现（未经编译验证） |
| `database/migrations/*.sql` | `001_initial.sql`（6 张表）、`002_fts5.sql`（FTS5 表 + 3 个同步触发器） | 迁移框架已实现 |
| `artwork/mod.rs` | LRU 磁盘缓存、多尺寸档位、淘汰、重建、预加载 | 纯逻辑已实现；图片字节加载需注入 |
| `network/mod.rs` | 连通性测试、协作式超时、重试、断线状态 | 状态机已实现；**非硬超时** |
| `player/mod.rs` | `PlayerBackend` trait、五层能力模型、`MpvBackend` 占位 | **UNVALIDATED / NOT INTEGRATED** |
| `subtitles/mod.rs` | 字幕轨道管理、SRT/WebVTT 解析、外挂延迟 | 纯逻辑已实现；ASS/PGS 保留原生渲染 |
| `history/mod.rs` | 续播进度、播放次数、历史 | 已实现 |
| `diagnostics/mod.rs` | `DiagnosticsReport` 生成 | 已实现；未探测能力一律 `not verified` |

## 关键设计决策

### 为什么用 rusqlite 而非 sqlx
`rusqlite = { version = "0.32", features = ["bundled"] }` 随 crate 编译 SQLite
amalgamation 并启用 **FTS5**，目标机无需预装 SQLite，Windows MSVC 离线交付最省事；
本应用是单机桌面程序，同步 API 足够，避免 sqlx 的 async runtime 与编译期查询检查。

### 迁移版本管理
`schema_migrations`（version / name / applied_at）是版本真源：按版本升序、
事务内逐条执行 `include_str!` 嵌入的 SQL，防回滚/跳版本。除该表外还冗余写入
`PRAGMA user_version`，以对齐 `docs/adr/0005-data-locations.md` 的表述；
`Database::db_version()` 仍从 `schema_migrations` 读取。

### Media ID 与路径解耦
`derive_media_id(fingerprint)` 用 UUID v5（命名空间 `NAMESPACE_URL`）从内容指纹派生，
**不含路径**。`media_versions.relative_path` 是相对媒体源根的路径，换 NAS 地址只需
`Database::remap_source` 更新 `sources.uri`，所有版本行与元数据保持不变。一个
`media` 可对应多行 `media_versions`（1080P / 4K / HDR / 不同语言）。

### 内容指纹与增量扫描
指纹 = 文件大小 + 头/中/尾各 64 KiB 的 SHA-256（`Seek` 读取，不读满大文件）。
增量决策依据 `size + mtime + fingerprint` 三者：仅 mtime 抖动但指纹一致时跳过，
避免重复刮削。断点恢复用 `ScanCursor`（最后处理的相对路径，字典序）。

### 凭据安全
- 任何结构体都不保存明文密码：`CredentialRef` 只保存「去哪里取」（键名/环境变量名），
  `Secret` 的 `Debug` 恒脱敏；
- TMDB API Key 从环境变量 `YINGMU_TMDB_API_KEY` 读取，作为 Bearer 头临时构造，
  **不写入 URL**、不硬编码；
- `MediaSource.uri` 不含 `user:password@`；
- 源码中不含任何 Token / Key / 密码 / NAS 凭据 / 私人路径 / 本机绝对路径。

### 刮削回退
`merge_scraped` 采用「只填补空白、绝不覆盖原始文件信息」：本地/NFO/手动修正的已有
信息优先；刮削失败（`None`）时完全返回基线，绝不返回看似成功但字段被清空的元数据。

### 五层能力模型（player）
`identified → metadata-parsed → decoded → rendered → native-output`，任一层不能由
上一层推定成立。`MpvBackend::unverified_capabilities()` 返回覆盖五层的声明，
全部 `verified=false`。识别到 HDR 标识 ≠ 解码 ≠ 正确渲染 ≠ HDR 原生输出。

## 未验证 / 未实现清单（诚实性约束）

- **libmpv 未集成**：无 `libmpv-2.dll`、无 D3D11/HWND 原生视频 Surface、无嵌入式播放；
- **NSIS 未构建**：未生成任何安装包；
- **HDR / Dolby Vision / 音频直通未验证**：未声称任何认证或输出能力；
- **媒体探测不可用**：无 FFmpeg/libmpv 绑定，时长/分辨率/编码/HDR 一律留空，
  不伪造探测结果；
- **SMB / WebDAV provider 未验证**：所有 I/O 返回明确错误；
- **TMDB / 封面在线 HTTP 传输未绑定**：由平台层注入 `HttpExecutor` / `ArtworkLoader`，
  默认 `Noop*` 实现返回明确的「未验证」错误；
- **网络超时是协作式检查**：无 async runtime，无法强制中断阻塞中的系统调用；
- **所有 `#[cfg(test)]` 单元测试未经运行**：Rust 1.99.1 已安装；本地已具备 MSVC 编译器/链接器与 Windows SDK 导入库/头文件（便携工具链，非系统级 Visual Studio 安装，需显式配置 `PATH` / `LIB` / `INCLUDE`），但受构建环境限制，仓库 Rust 代码尚未通过完整编译与测试验证。
  Windows SDK / link.exe，且 crate 依赖当前不可得，`cargo test` 未能进入编译阶段；
  测试代码按可编译标准编写，覆盖指纹/去重/NFO 解析/迁移 SQL 结构/搜索条件构造/
  FTS 触发器/字幕解析等，但未执行验证。

## 运行前提（供具备工具链的机器）

```bash
cargo fmt --all -- --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
```

本机当前状态（实测）：Rust 1.99.1 已安装（位于用户目录 `.cargo/bin`，不在自动化
shell 默认 PATH，需手动加入 PATH 后使用）；本地已具备便携 MSVC 编译器/链接器与
Windows SDK 导入库/头文件（非系统级 Visual Studio 安装，需显式配置 `PATH` / `LIB` /
`INCLUDE`）。crates.io 依赖可访问，`Cargo.lock` 已生成（419 个包锁定）。
`cargo fmt --all -- --check` **已通过（exit 0，格式已归一化）**；
`cargo check` / `cargo test` / `cargo clippy` 受构建环境限制**未成功完成**：
① 默认 shell 中 Git Bash 的 `/usr/bin/link.exe`（GNU coreutils 硬链接命令）遮蔽
MSVC 链接器，报 `link: extra operand`；② 部分执行通道存在 safe-delete 删除拦截，
cargo 清理 rlib 临时目录时返回 `拒绝访问 (os error 5)`。二者均发生在第三方依赖
编译阶段，未到达本模块自身源码类型检查完成。所有 `#[cfg(test)]` 单元测试未运行。
**在拿到确切编译输出之前，本模块一律保持「未经编译验证」**，不预写通过或失败的结论。
需在允许正常删除临时文件的构建环境（如 GitHub Actions `windows-latest`）复跑编译与测试。
