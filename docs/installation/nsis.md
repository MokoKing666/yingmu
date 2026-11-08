# Windows NSIS 安装器 — 双安装范围说明

> 配置位置：`apps/desktop/src-tauri/tauri.conf.json` → `bundle.windows.nsis.installMode`
> 当前值：`both`。安装器由 Tauri 2 官方 NSIS Bundler 生成，使用其标准
> MultiUser 模板，**没有**自定义权限绕过或私有 NSIS 流程。

## 1. 安装范围选择

运行同一个 `YingMu-Setup-<version>-x64.exe`，安装向导会先显示
「安装范围」页面（`MULTIUSER_PAGE_INSTALLMODE`），提供两个选项：

| 选项 | 中文界面文案（NSIS/MultiUser 标准字符串） | 默认目录 | 注册表范围 | 快捷方式 | 安装器权限 |
|---|---|---|---|---|---|
| 仅为我安装 | 仅为我安装（当前用户） | `%LOCALAPPDATA%\YingMu` | `HKCU` | 当前用户开始菜单 | **仍需 UAC 提权**（见下方说明） |
| 为所有人安装 | 为这台电脑上的所有用户安装 | `%ProgramFiles%\YingMu`（x64 上为 64 位 Program Files） | `HKLM` | 所有用户开始菜单 | 需要 UAC 提权 |

> **必须区分两件事，避免误读上表：**
>
> 1. **安装器本身**：`installMode: "both"` 使用 `MULTIUSER_EXECUTIONLEVEL Highest`，
>    因此**两种范围在启动安装器时都会请求管理员权限（UAC）**。选择「仅为我安装」
>    只是把程序装到 `%LOCALAPPDATA%` 并写 `HKCU`，**不会**取消启动时的提权请求。
>    这是 Tauri 2 标准 MultiUser 模板的既定行为，本项目不修改执行级别去伪装「无 UAC」。
> 2. **安装后的影幕本体**：始终以**普通用户权限**运行，读取自己的 `%APPDATA%\YingMu`
>    与 `%LOCALAPPDATA%\YingMu`，不需要管理员权限。

在 `installMode: "both"` 下，Tauri 模板会：

- `!define MULTIUSER_MUI` 与 `!insertmacro MULTIUSER_PAGE_INSTALLMODE` —— 范围选择页；
- `!define MULTIUSER_USE_PROGRAMFILES64`（x64）—— 正确使用 64 位 Program Files；
- `!define MULTIUSER_EXECUTIONLEVEL Highest` —— 安装器启动即请求提升；
- `!insertmacro SetContext` 与 `SHCTX` —— 按选择切换 `HKCU` / `HKLM`；
- 卸载器 `MULTIUSER_UNINIT` —— 卸载范围与安装范围一致。

## 2. 安装目录页面

模板固定包含 `!insertmacro MUI_PAGE_DIRECTORY`（顺序在范围选择页之后），
用户可以：

- 查看最终完整安装路径；
- 通过「浏览…」修改安装目录；
- 切换安装范围后，默认路径按上表重新计算（`currentUser` → `$LOCALAPPDATA`，
  `perMachine` → `$PROGRAMFILES64`）。

本项目**没有**把 `InstallDir` 写死，也没有移除目录页。

## 3. UAC 行为（必须如实告知）

Tauri 2 的 `installMode: "both"` 使用 `MULTIUSER_EXECUTIONLEVEL Highest`：
**安装器启动时就会请求管理员权限，即使用户最终选择「仅为我安装」。**

这是 Tauri/NSIS 标准模板的既定行为。本项目接受该行为，不通过
`RequestExecutionLevel user` 之类的改动去伪装「无需管理员权限」，
因为那会破坏 MultiUser 模板的注册表与卸载一致性。

安装完成后，**应用本身以普通用户权限运行**，不需要管理员权限。

## 4. 用户数据与安装目录彻底分离

无论选择哪种范围，用户数据始终按**当前登录用户**存放：

| 数据 | 路径 |
|---|---|
| 配置与数据库 | `%APPDATA%\YingMu`（`yingmu.db`、`settings.json`） |
| 封面缓存 | `%LOCALAPPDATA%\YingMu\Cache` |
| 日志 | `%LOCALAPPDATA%\YingMu\Logs` |

因此：

- 程序本体可以装在 `Program Files`，但数据库、海报缓存、播放记录**绝不写入安装目录**；
- 选择「为所有人安装」时，每个 Windows 用户仍有各自的收藏、历史与配置，
  不共享同一个私人数据库；
- 卸载默认**保留**用户数据；升级保留媒体库与播放记录；
- 卸载只清理对应范围的程序文件与快捷方式。

> 以上为用户数据路径的**代码约定**（`DataDirs::resolve()` 与 `docs/adr/0005-data-locations.md`）。
> 实际安装后的写盘行为需要真实安装测试验证，见下一节。

## 5. 验证状态（截至当前提交，如实记录）

| 验证项 | 状态 | 依据 |
|---|---|---|
| `installMode: both` 配置生效 | ✅ 已写入 `tauri.conf.json` | 源码 |
| 生成的 NSIS 脚本包含范围选择页与目录页 | ✅ **CI 实测通过** | `installer.nsi`：`MULTIUSER_PAGE_INSTALLMODE`(176)、`MUI_PAGE_DIRECTORY`(409)、`MULTIUSER_USE_PROGRAMFILES64`(113/115)、`MULTIUSER_EXECUTIONLEVEL Highest`(121)、`INSTALLMODE "both"` |
| 安装包真实生成、>1MB、PE 头、SHA-256 | ✅ **CI 实测通过** | `YingMu-Setup-0.3.0-x64.exe`，4.48 MiB（4,694,009 字节），PE32（NSIS stub 固定为 32 位，可安装在 64 位 Windows 上），版本资源 `FileVersion/ProductVersion = 0.3.0`、`ProductName = 影幕 YingMu`，未签名；SHA-256 `9891a7d0b9ccd1822de25550cb1af007460487f64174afbfaa760afb9d7de250`；Artifact `yingmu-nsis-installer`（CI run 42480025570）；NSIS 打包含时间戳，**构建不可复现**，哈希以 Artifact 内 `SHA256SUMS.txt` 为准 |
| **交互式安装：选「仅为我」→ LocalAppData** | ❌ **未执行** | 需要可交互 Windows 桌面/VM |
| **交互式安装：选「所有人」→ Program Files + UAC** | ❌ **未执行** | 需要可交互 Windows 桌面/VM |
| 多用户数据隔离实测 | ❌ **未执行** | 需要多用户 Windows 环境 |
| 覆盖安装 / 升级 / 卸载数据保留 | ❌ **未执行** | 需要可交互安装环境 |

GitHub Actions 的 `windows-latest` runner 是无交互会话，无法完成点击安装向导、
观察 UAC、切换 Windows 用户等操作；本项目也**没有**可用的独立 Windows 虚拟机
或 Windows Sandbox 来执行这些测试。因此上述四项保持「未执行」，
不以「构建成功」冒充「安装测试成功」。
