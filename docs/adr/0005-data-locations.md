# ADR 0005：数据位置与存储边界

| 项 | 内容 |
| --- | --- |
| 编号 | 0005 |
| 日期 | 2026-11-06 |
| 状态 | **已接受** |
| 相关 | `0003-media-id`、`docs/database/schema.md`、`docs/testing/strategy.md` |

## 状态

已接受。数据目录以 Rust 侧 `DataDirs::resolve()` 为准，统一为 `%APPDATA%\YingMu` 体系，`com.moko.yingmu` 仅作应用标识符 / Bundle ID；不入库规则在 `.gitignore`、`types.ts`、`bridge.ts` 中体现。**数据库/迁移/FTS5 源码已落地（含两份 SQL 迁移），但未经编译验证**（本地工具链已就位，仓库 Rust 代码尚未通过完整编译与测试验证），安装与升级测试未执行。

## 背景

- 应用需持久化媒体库、播放进度、设置、海报缓存、扫描状态与日志。
- 必须避免把密钥、凭据、用户数据、私有媒体样本、构建产物、字体二进制提交进仓库（`.gitignore` 顶部注释：「绝不把密钥、用户数据、私有路径、构建产物、媒体样本提交进仓库」）。
- 文档与代码都不得写入本机绝对路径，用户数据目录需用 `%APPDATA%` / `%LOCALAPPDATA%` 之类占位符表达。
- `MediaSource.uri` 只存定位，`requiresAuth` 只存布尔标记，凭据永不入库（`types.ts` 注释）。
- 用户原始需求明确建议数据目录为 `%APPDATA%\YingMu`、`%LOCALAPPDATA%\YingMu\Cache`、`%LOCALAPPDATA%\YingMu\Logs`；Rust 实现 `apps/desktop/src-tauri/src/lib.rs` 的 `DataDirs::resolve()` 与此一致。

## 决策

| 类别 | 位置 / 规则 |
| --- | --- |
| 应用标识符 | `com.moko.yingmu` 仅作应用标识符 / Bundle ID（配置、`identifier` 字段），**不是目录名** |
| SQLite 数据库 | `%APPDATA%\YingMu\`（数据库文件 `yingmu.db`、设置 `settings.json`），WAL 模式；迁移版本真源为 `schema_migrations` 表，并冗余维护 `PRAGMA user_version` 镜像以对齐 `DiagnosticsReport.dbVersion` |
| 海报 / 图像缓存 | `%LOCALAPPDATA%\YingMu\Cache\Artwork\`，按 `ArtworkRequest.size` 分档 |
| 日志 | `%LOCALAPPDATA%\YingMu\Logs\` |
| 设置 | 与数据库同处 `%APPDATA%\YingMu`，默认 `DEFAULT_SETTINGS` |
| 凭据 | 经安全存储注入，不写入 `uri`、数据库或任何可序列化字段 |
| 时间戳 | 统一 ISO 8601 字符串，跨 TS/Rust 序列化一致 |
| 不入库 | `*.db` / `*.db-wal` / `*.db-shm` / `*.sqlite*` / `*.log` / `cache/` / 媒体样本 / 字幕样本 / 字体二进制 / `dist/` / `target/` / `*.exe`/`*.msi` 等（见 `.gitignore`） |
| 文档表达 | 用户数据目录统一用 `%APPDATA%` / `%LOCALAPPDATA%` 占位符，不写本机绝对路径 |

目录命名**以实现为准**：`DataDirs::resolve()` 使用常量 `DATA_DIR_NAME = "YingMu"`，解析为 `%APPDATA%\YingMu`、`%LOCALAPPDATA%\YingMu\Cache`、`%LOCALAPPDATA%\YingMu\Logs`，全部不写入安装目录（`currentUser` 安装模式下安装目录通常不可写）。早期文档曾把 `com.moko.yingmu` 误写为数据目录名，现统一纠正：`com.moko.yingmu` 只保留为应用标识符 / Bundle ID，不用作目录名。

迁移版本：版本真源是 `schema_migrations`（version / name / applied_at）表，按版本升序、事务内逐条执行 `include_str!` 嵌入的 SQL；除该表外还冗余写入 `PRAGMA user_version`（便于外部工具快速识别数据库版本），`Database::db_version()` 仍从 `schema_migrations` 读取。此表述与 Rust 实现及 `crates/yingmu-core/README.md` 一致。

数据保留策略：升级 / 覆盖安装 / NAS remap 均不改 `MediaId` 与用户数据；迁移先备份、事务内执行、失败回滚；卸载默认不自动删除用户数据目录（或提供明确可选项）。详见 `docs/database/schema.md`。

## 后果

正面：

- 用户数据与代码仓库隔离，凭据不落盘到库，降低泄露风险。
- 升级、覆盖安装、remap 后收藏 / 进度 / 播放列表 / 设置全部保留。
- 数据库文件、WAL、日志、媒体样本、字体二进制被 `.gitignore` 排除，仓库保持干净。
- 用户数据目录与 Rust 实现 `DataDirs::resolve()` 完全一致，`com.moko.yingmu` 不再被误用为目录名；ADR、文档与代码单点对齐。
- 迁移版本真源 `schema_migrations` 与冗余 `PRAGMA user_version` 镜像的表述，与 Rust 实现及 `crates/yingmu-core/README.md` 一致。

负面 / 待解决：

- 备份、迁移、卸载/覆盖安装的数据保留策略为**设计规格**，因安装包本阶段未生成，相关安装与升级测试**未执行**。
- 多用户、便携模式（数据随应用目录）、漫游/云同步等场景**未定义、未验证**。
- 数据库/迁移/FTS5 源码已落地（含两份 SQL 迁移），但未经编译、未运行（受构建环境限制）；中文分词选型待验证。
- 目录名由 `DataDirs::resolve()` 单点定义；任何变更须同步该常量、本 ADR 与下游文档，避免再次出现「Bundle ID 被当作目录名」的漂移。
- 需持续保证文档、日志、错误信息中不出现本机绝对路径。

## 备选方案

| 方案 | 未采用原因 |
| --- | --- |
| 数据随应用安装目录（便携模式） | 升级/卸载易丢数据，权限与多用户场景复杂；可作为未来可选模式，当前未定义 |
| 用注册表存配置 | 不适合结构化媒体库与全文检索，且备份/迁移困难 |
| 单文件 JSON 存储 | 无法支撑 FTS5 全文检索、分页、去重与事务迁移 |
| 云端同步 / 云数据库 | 超出本地个人媒体中心范围，且涉及凭据与隐私边界 |
| 把演示/样本数据、字体、数据库提交进仓库 | 违反 `.gitignore` 与授权约束，明确禁止 |
| 用 `com.moko.yingmu` 作为数据目录名 | 与用户原始需求及 Rust 实现 `DataDirs::resolve()` 不一致；`com.moko.yingmu` 是应用标识符 / Bundle ID，不是目录名 |
