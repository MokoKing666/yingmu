# ADR 0003：稳定 Media ID 与多版本

| 项 | 内容 |
| --- | --- |
| 编号 | 0003 |
| 日期 | 2026-11-06 |
| 状态 | **已接受** |
| 相关 | `docs/architecture/media-id.md`、`docs/database/schema.md`、`0005-data-locations.md` |

## 状态

已接受。`MediaId` / `SourceId` / `VersionId` 类型与相关字段已在 `packages/media-models/src/types.ts` 定义；**Rust 侧已按此设计实现 UUID v5 派生（`derive_media_id`）、命名空间划分、remap 匹配（`Database::remap_source`）与数据库模块，源码已落地，但未经编译验证**（本地工具链已就位，仓库 Rust 代码尚未通过完整编译与测试验证）。

## 背景

- 媒体文件位于本地 / UNC / SMB / WebDAV 源，NAS 地址、共享名、协议前缀可能变更；用户也会重命名、移动、重新编码文件。
- 用户数据（收藏、标签、播放次数、续播进度、幕墙排序、播放列表、海报缓存）绑定在作品上，必须**跨路径、跨地址变更保持稳定**。
- 同一作品常有多个版本（1080P / 4K / HDR / DV / 不同语言），进度需绑定到具体版本，而作品级数据需聚合。
- `types.ts` 顶部约定：「MediaId 是稳定内容标识，与文件路径解耦；路径变更不得导致 ID 变化」。

## 决策

1. **作品级 `MediaId`**：采用 UUID v5 风格，由「作品级内容指纹 + 命名空间」确定性派生，**不**由路径、文件名或源地址派生。作品级内容指纹来自归一化匹配键（优先外部 ID 如 TMDB，其次 `kind` + 规范化标题 + `year`）。
2. **文件级 `fingerprint`**：`MediaVersion.fingerprint = 部分哈希 + 大小`，用于文件级去重与扫描断点恢复，**不参与** `MediaId` 生成。
3. **多版本**：一个 `MediaId` 对应多个 `MediaVersion`（`relativePath`、`label`、`isDefault`、各自的 video/audio/subtitles/chapters）；`PlaybackProgress` 绑定 `(mediaId, versionId)`。
4. **remap 策略**：`MediaVersion.relativePath` 为相对媒体源根的路径；源地址变更只更新 `MediaSource.uri`（保留 `SourceId`），按 `fingerprint` → `relativePath + sizeBytes` 优先级匹配，`MediaId` / `VersionId` 与全部用户数据保持不变。详见 `docs/architecture/media-id.md`。
5. **凭据隔离**：`MediaSource.uri` 不存凭据，`requiresAuth` 仅布尔标记，凭据经安全存储注入。

```mermaid
flowchart LR
  K["归一化匹配键"] --> V5["UUID v5 + 命名空间"] --> MID["MediaId（作品级）"]
  MID --> ITEM["MediaItem<br/>收藏/进度/标签/播放列表"]
  MID --> VERS["MediaVersion[]<br/>relativePath + fingerprint"]
  VERS --> REMAP["源地址变更：只改 Source.uri"]
  REMAP -.->|"ID 不变、用户数据保留"| ITEM
```

## 后果

正面：

- NAS 地址变更、文件重命名、协议调整不会导致作品记录漂移，用户数据全部保留。
- 作品级聚合与版本级进度各司其职，切换版本不串进度。
- 稳定主键使 FTS5 分页、去重、海报缓存不受 remap 影响。

负面 / 待解决：

- 需要维护匹配键归一化规则与外部 ID 优先级；元数据刮削失败时（`MetadataOrigin` 允许部分字段为空）需回退策略，可能引入误合并/误拆分，需冲突标记与人工确认。
- 内容被重新编码时 `fingerprint` 变化，需按「新版本 / 新文件候选」处理，不能静默覆盖。
- **派生、remap 匹配算法与数据库实现的 Rust 源码已落地，但未经编译验证**（受构建环境限制，未经编译验证）；NAS 实机 remap 验证**未执行**。
- 中文标题、多语言原名、剧集分季分集等归一化细节待实现时确认。

## 备选方案

| 方案 | 未采用原因 |
| --- | --- |
| 用文件路径 / UNC 字符串做 ID 或哈希 | 地址变更、重命名即导致 ID 漂移，丢失全部用户数据 |
| 数据库自增整数主键 | 跨库合并、重扫、多设备不一致，且与内容无稳定关联 |
| 随机 UUID v4 + 路径映射表 | 不可确定性重算，重扫/迁移易产生重复作品，映射表本身需维护 |
| 仅按文件名解析标题年份 | 命名不规范、多版本、多语言时不稳定，无法表达外部 ID 归一 |
| 把多版本拆成多个 `MediaItem` | 作品级数据（收藏/进度/幕墙）无法聚合，界面重复 |
