# apps/desktop/src-tauri — Tauri 2 桌面端壳

> **本模块源码未经编译验证，不得视为可运行实现。** Rust 1.99.1 已安装；本地已具备 MSVC 编译器/链接器与 Windows SDK 导入库/头文件（便携工具链，非系统级 Visual Studio 安装，需显式配置 `PATH` / `LIB` / `INCLUDE`），但受构建环境限制，本工作区尚未通过完整编译与测试验证。
>
> 目标 `x86_64-pc-windows-msvc`。`cargo check` / `cargo tauri build` / `cargo test`
> 构建与测试的实测状态见 `docs/testing/strategy.md`（`cargo fmt --all -- --check` 已通过；其余未成功完成）。
> 不得声称：libmpv 已集成、NSIS 已构建、HDR/Dolby 已验证、测试已通过。

## 关键配置（tauri.conf.json）

| 项 | 值 | 说明 |
| --- | --- | --- |
| `identifier` | `com.moko.yingmu` | 全项目唯一标识符，**禁止**使用 `com.yingmu.player` |
| `productName` | `影幕 YingMu` | |
| `version` | `0.1.0` | 与 `package.json` / `Cargo.toml` / `yingmu-core::VERSION` 一致 |
| `build.frontendDist` | `../dist` | Vite 产物目录 |
| `bundle.targets` | `["nsis"]` | 首发 Windows x64 |
| `bundle.windows.nsis.languages` | `["SimpChinese"]` | NSIS 简体中文 |
| `displayLanguageSelector` | `false` | 不弹语言选择 |
| `installMode` | `currentUser` | 当前用户安装，不写 `Program Files` |
| `webviewInstallMode.type` | `downloadBootstrapper` | WebView2 引导下载安装 |

### WebView2 依赖提示
`downloadBootstrapper` 表示安装器在目标机缺少 WebView2 Runtime 时下载引导程序
完成安装，因此**首次安装需要可用的网络**。安装包本身不内嵌完整 Evergreen Runtime。
应用启动时若 WebView2 不可用，Tauri 会报错退出——这一行为需要实机验证（当前未验证）。

### 用户数据目录（绝不写安装目录）
由 `src/lib.rs` 的 `DataDirs::resolve()` 通过环境变量解析，只写：

- `%APPDATA%\YingMu` — `yingmu.db`（SQLite）、`settings.json`
- `%LOCALAPPDATA%\YingMu\Cache` — 封面缓存
- `%LOCALAPPDATA%\YingMu\Logs` — 日志

`installMode: currentUser` 下安装目录通常不可写，任何用户数据都不应落到安装目录。

> **数据目录命名**：按用户数据目录规范固定为 `YingMu`，ADR 0005 已同步为一致
> 表述；`com.moko.yingmu` 仅为应用标识符（Bundle ID），不用作目录名。目录名已
> 集中在 `lib.rs` 的 `DATA_DIR_NAME` 常量，便于单点维护。

### 安装包命名 `YingMu-Setup-{version}-x64.exe`
Tauri 2 的 NSIS 配置**没有**直接指定输出文件名的字段，默认产物名由
`productName` + `version` + 目标架构生成（形如 `影幕 YingMu_0.1.0_x64-setup.exe`）。
要得到 `YingMu-Setup-0.1.0-x64.exe`，需在打包流水线中对产物重命名；
重命名脚本属于 `scripts/**` 所有权（本团队不写），此处仅记录约定。

### 应用图标
`bundle.icon` 指向 `icons/icon.ico`。本团队不创建/提交二进制图标，图标由
`npm run brand:icons`（`scripts/generate-icons.mjs`，其他团队所有权）生成；
当前目录中已由该脚本产出图标文件。`cargo tauri build` 的前置步骤仍是先生成图标，
否则 `tauri::generate_context!()` 在编译期读取图标会失败。详见 `icons/README.md`。

## IPC 命令（与 bridge.ts 的 `IPC` 常量一一对应）

命令名即 `#[tauri::command]` 函数名，统一使用
`#[tauri::command(rename_all = "camelCase")]`，使 `source_id` 等参数在前端以
`sourceId` 形式传入。

- `library.rs`：`yingmu_library_list` / `yingmu_library_get` /
  `yingmu_library_update_metadata` / `yingmu_library_set_favorite` /
  `yingmu_library_versions`
- `sources.rs`：`yingmu_source_list` / `yingmu_source_add` /
  `yingmu_source_remove` / `yingmu_source_test`
- `scan.rs`：`yingmu_scan_start` / `yingmu_scan_cancel` / `yingmu_scan_status`
- `search.rs`：`yingmu_search`
- `artwork.rs`：`yingmu_artwork_get` / `yingmu_artwork_rebuild`
- `history.rs`：`yingmu_history_list` / `yingmu_history_save`
- `playlists.rs`：`yingmu_playlist_list` / `yingmu_playlist_save` / `yingmu_playlist_remove`
- `player.rs`：`yingmu_player_open` / `yingmu_player_control` /
  `yingmu_player_state` / `yingmu_player_attach_surface`
- `settings.rs`：`yingmu_settings_get` / `yingmu_settings_set`
- `diagnostics.rs`：`yingmu_diagnostics_report`

**契约已对齐**：`PlatformBridge.playlistRemove(id)` 原先缺少 `IPC` 常量，架构师已补充
`IPC.playlistRemove = 'yingmu_playlist_remove'`；本模块已实现并在 `generate_handler!`
注册。现 `IPC` 共 27 条命令，全部一一落地。

### 返回值诚实性
- 库/源/搜索/历史/播放列表/设置/诊断：真实调用 `yingmu-core`，返回真实结构；
- `artworkGet` 未命中缓存时返回明确错误（在线加载器未注入，不返回伪造路径）；
- `playerOpen` / `playerControl` / `playerAttachSurface`：由 `MpvBackend` 返回明确的
  「未验证」错误；`playerState` 只返回真实的初始 `Idle` 状态；
- `sourceTest` 对未集成的 SMB/WebDAV provider 如实返回 `ok=false`。

## capabilities/default.json（最小权限）
仅 `windows: ["main"]` + `permissions: ["core:default"]`，不开通
fs / shell / http / dialog 等插件权限；业务能力全部通过自定义 command 提供，
前端不直接获得文件系统访问权。

## 未验证清单
- Rust 1.99.1 已安装；本地已具备 MSVC 编译器/链接器与 Windows SDK 导入库/头文件（便携工具链，非系统级 Visual Studio 安装，需显式配置 `PATH` / `LIB` / `INCLUDE`）；但受构建环境限制，
  全部 Rust 代码未经编译验证；
- 无 `libmpv-2.dll`，无嵌入式原生视频 Surface；
- NSIS 安装包未构建，简体中文/安装模式/快捷方式/重命名均未实机验证；
- WebView2 `downloadBootstrapper` 行为未实机验证；
- 所有 `#[cfg(test)]` 测试未运行。
