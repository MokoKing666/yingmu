# native/windows — 嵌入式原生视频 Surface 与 libmpv 集成（计划）

> **当前状态：未验证（UNVALIDATED / NOT INTEGRATED）**
>
> 截至 0.1.0，本目录**没有任何原生代码、没有 `libmpv-2.dll`、没有 HWND/D3D11
> 实现、没有做过任何实机技术验证**。本文件只记录技术验证**计划**与许可注意事项，
> 不代表该能力已实现、已集成或已验证。所有 Rust 侧代码也未经编译验证
> （Rust 1.99.1 已安装；本地已具备 MSVC 编译器/链接器与 Windows SDK 导入库/头文件（便携工具链，非系统级 Visual Studio 安装，需显式配置 `PATH` / `LIB` / `INCLUDE`）；仓库 Rust 代码仍未经完整编译与测试验证）。

## 目标

在 Tauri 2 + WebView2 的**应用窗口内**嵌入原生视频输出，而不是打开独立的外部
播放器窗口。前端只持有 `PlayerSurface.handle`，不解释其内容
（见 `packages/player-api/src/index.ts` 与 `crates/yingmu-core/src/player/mod.rs`）。

## 计划中的技术组合（均未验证）

1. **宿主窗口 HWND**：由 Tauri 窗口取出 WebView2 宿主的 `HWND`；
2. **子 Surface**：在该窗口内创建一个原生子窗口/交换链区域，随主窗口移动、缩放、
   层级与 DPI 变化同步；
3. **D3D11 / gpu-next**：libmpv 使用 `--gpu-context=d3d11` 或 `gpu-next` 输出到该
   Surface 的句柄；需要验证与 WebView2 合成器（DirectComposition）的叠加顺序、
   透明/圆角/无边框窗口下的裁切与输入命中；
4. **事件桥接**：把 mpv 的 property 变化/状态/统计转成 Tauri 事件，供
   `PlayerBackend.onStateChange` / `onStats` 消费；
5. **字幕渲染**：ASS 特效与 PGS/VobSub 图片字幕必须走原生渲染路径，
   禁止降级为纯文本（见 `crates/yingmu-core/src/subtitles/mod.rs`）；
6. **能力验证**：按五层模型逐层实机验证
   `identified → metadata-parsed → decoded → rendered → native-output`，
   其中 HDR10 / Dolby Vision / 音频直通的 `native-output` 层需要专门的输出链路与
   显示设备验证，**当前一律 `verified=false`**，不得声称 HDR/Dolby 已验证。

## 需要实机验证的关键问题（当前全部未验证）

- WebView2 的 DirectComposition 与 D3D11 视频层的 Z 序与合成是否稳定；
- 窗口 DPI 缩放、最小化/还原、全屏切换时 Surface 尺寸与位置同步；
- 硬解（`hwdec`）是否**实际生效**，而非仅「已请求」；
- 色彩空间 / 像素格式 / tone-mapping 的真实上报，区分「识别到 HDR」与
  「HDR 原生输出」；
- ASS 特效与 PGS 图片字幕在嵌入式 Surface 上的渲染正确性；
- 多显示器、不同 GPU 驱动下的兼容性与丢帧统计可信度。

## libmpv DLL 的合法获取与许可注意事项

> 以下为工程与合规**注意点**，不是法律意见；正式分发前必须由法务确认，
> 并以所用二进制构建附带的许可证文本为准。

- **合法来源**：只从 mpv 官方发布渠道、项目维护方提供的构建，或由源码在合规
  构建环境中自行编译获取 `libmpv-2.dll`；不要从第三方未知站点下载来路不明的
  DLL，也不要把 DLL 提交进本仓库。
- **许可证取决于构建配置**：mpv 本身主要是 LGPL-2.1+ / GPL-2.0+，但一旦链接了
  启用 GPL 组件的 FFmpeg（常见预编译构建即如此），整体分发通常需要按 **GPL**
  履行义务（提供对应源码、保留许可证与声明、允许替换该库等）。若业务需要
  LGPL 路径，必须确认所用构建是纯 LGPL 依赖链，并由法务评估。
- **动态链接与替换**：以动态链接方式使用 libmpv，并确保最终用户可替换该库，
  是 LGPL 类合规的常见要求；具体以许可证文本与法务结论为准。
- **声明与源码提供**：分发包中需保留许可证、版权声明与 ATTRIBUTION，并按许可
  要求提供（或书面承诺提供）对应源码与构建脚本。
- **不擅自内嵌**：本机/仓库均不带 DLL；安装器是否随包分发 DLL、或运行时探测
  系统已安装的 libmpv，需在完成许可评估后决定。

## 与当前代码的关系

`crates/yingmu-core/src/player/mod.rs` 的 `MpvBackend` 是**占位实现**：
`validated()` 恒为 `false`，`initialize` / `attach_surface` / `open` / `command`
一律返回 `CoreError::Unvalidated`，`capabilities()` 五层全部 `verified=false`。
`DiagnosticsReport.backend` 当前恒为 `none`、`backendReady=false`。
在完成上述技术验证与许可评估之前，不得以任何形式对外声称播放器已可用或
HDR/Dolby 已支持。
