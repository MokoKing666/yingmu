# ADR 0004：播放器后端抽象

| 项 | 内容 |
| --- | --- |
| 编号 | 0004 |
| 日期 | 2026-11-06 |
| 状态 | **已接受（接口层）／待验证（实现层）** |
| 相关 | `0001-technology-stack`、`docs/playback/player-interface.md`、`docs/playback/windows-surface-validation.md`、`docs/dolby-compatibility/compatibility-matrix.md` |

## 状态

- 接口层：`PlayerBackend` / `PlayerCommand` / `PlayerState` / `PlayerSurface` / `CapabilityStage` 五层模型 / `DecodeStats` 已在 `packages/player-api/src/index.ts` 定义，**已接受**。
- 实现层：目标后端 libmpv **未集成、未验证**；`PlayerBackend.validated` 在当前必须为 `false`；D3D11 + 原生 HWND Surface 嵌入、4K HEVC / HDR / DV 输出、音频直通**均未实机验证**。

## 背景

- 产品需要**嵌入式**原生播放（视频在应用窗口内渲染），而非拉起独立外部播放器窗口。
- 播放链路涉及 Windows 专属能力（D3D11、HWND、WASAPI、DXGI 显示路径），这些不得进入 React 组件或纯 TS 契约层。
- HDR / Dolby Vision / 多声道音频的「识别、解码、渲染、原生输出」是不同层次的能力，容易被混为一谈；需要机制防止「读到标识」被误当成「支持输出」。
- `player-api` 顶部注释约束：React 组件只依赖接口；原生 Surface 由平台层创建并嵌入 Tauri 窗口，前端只持有 handle；禁止用独立外部播放器窗口冒充嵌入式播放。

## 决策

1. **抽象与实现解耦**：定义 `PlayerBackend` 接口，前端只依赖该接口，平台层提供实现；目标后端为 libmpv（作为目标，非既成能力）。
2. **Surface 句柄化**：`PlayerSurface { handle, embedded, renderer? }`；平台层创建并绑定原生 Surface，`embedded` 必须为 `true` 才代表嵌入式播放，前端不解释 handle 内容。
3. **能力五层模型**：`identified → metadata-parsed → decoded → rendered → native-output`；`CapabilityClaim.verified` 未验证一律 `false`，任何一层不得由上一层推定成立。
4. **诚实诊断**：`PlayerBackend.validated`、`DiagnosticsReport.backend/backendReady`、`DecodeStats`（`hwDecoderActive` / `outputPixelFormat` / `outputColorSpace` / `toneMappingActive` / `audioOutputMode`）用于上报真实探测值，未初始化不得谎称可用。
5. **命令与状态机**：`PlayerCommand` 联合类型 + 8 态状态机（`idle/loading/playing/paused/buffering/seeking/error/stopped`），见 `docs/playback/player-interface.md`。

## 后果

正面：

- 前端与 libmpv / D3D11 / WASAPI 解耦，后端可替换，能力上报有统一分级，避免误报支持。
- 五层模型为兼容性矩阵提供统一判定框架（见 `docs/dolby-compatibility/*`）。

负面 / 待解决：

- **libmpv DLL 未获取，后端未集成、未验证**；`validated` 保持 `false`。
- **D3D11 + 原生 HWND Surface 嵌入组合未验证**；**4K HEVC / HDR / DV 输出未实测**；**音频 bitstream / Atmos 传递未实机验证**。
- 原生输出依赖 GPU / 驱动 / Windows 显示路径 / 接口 / 显示设备，必须实机验证（见 `docs/playback/windows-surface-validation.md`）。
- **读取到 DV 标识不等于原生 DV 输出**；本项目**未获得 Dolby 官方认证、未使用 Dolby 官方 Logo**。
- 「未验证」不等于「不支持」，但**不得据此宣称支持**；证据齐备前不得在文档、界面、发行说明中宣称支持。

## 备选方案

| 方案 | 未采用原因 |
| --- | --- |
| 独立外部播放器窗口 / 调用系统默认播放器 | 违反「嵌入式播放」要求，明确禁止用独立窗口冒充 |
| HTML `<video>` 标签 | 难以覆盖 HDR/DV 原生输出、PGS/ASS 原生字幕、bitstream 直通等专业能力 |
| DirectShow / Media Foundation 自建管线 | 实现与维护成本高，格式/字幕/色彩处理覆盖不足 |
| 直接调用 libVLC / 其他封装 | 仍需相同的 Surface 嵌入与能力分级问题；libmpv 作为目标后端更贴合需求（**但尚未集成、未验证**） |
| 不做能力分级，只报「支持/不支持」 | 会把「文件识别」误当「原生输出」，导致虚假能力声明 |
