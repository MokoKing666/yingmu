# 第三方声明（Third-Party Notices）

> 状态：**许可证专项审查进行中，大量条目待法务确认**。本文逐项登记依赖的许可证与分发限制，**不编造许可证名称**；凡不确定项一律标注「待法务确认」。
> 前置声明（见 `docs/adr/0006-license-status.md`）：**本项目自身开源许可证尚未确定**；当前仓库**仅为代码审查公开，未授权第三方复制、修改或分发**。本声明不是授权文件。
> 版本来源：`apps/desktop/package.json`、根 `package.json`。仓库列给出通行的官方仓库标识，完整地址与 LICENSE 以各项目官方页面为最终依据；如与实际不符，以官方为准。

## 1. 依赖清单

> 「当前状态」说明：标注「已声明」= 在 `package.json` 中声明且 `node_modules` 已安装；标注「源码已落地」= Rust 侧 `Cargo.toml` 与源码已在仓库中，但**未经编译验证**（受构建环境限制）；标注「目标/未集成」「未获取」= 规划或目标组件，尚未在仓库中落地或未编译。**不得把规划组件当作已引入依赖，也不得把「源码已落地」当作「依赖已构建 / 已验证」。**

| 名称 | 版本 | 官方仓库（标识） | 许可证 | 使用方式 | 分发限制 / 当前状态 |
| --- | --- | --- | --- | --- | --- |
| React | `^19.0.0` | `facebook/react` | MIT（以官方 LICENSE 为准） | 前端运行时 | 分发需保留版权与许可声明；已声明 |
| React DOM | `^19.0.0` | `facebook/react` | MIT（以官方 LICENSE 为准） | 前端 DOM 渲染 | 同上；已声明 |
| Vite | `^6.0.0` | `vitejs/vite` | MIT（以官方 LICENSE 为准） | 开发/构建工具 | 开发期依赖，一般不随发行产物分发；已声明 |
| TypeScript | `^5.7.0`（desktop）/ `^5.9.2`（root） | `microsoft/TypeScript` | Apache-2.0（以官方 LICENSE 为准） | 类型检查/编译期 | 开发期依赖；已声明 |
| Tailwind CSS 4 | `^4.0.0` | `tailwindlabs/tailwindcss` | MIT（以官方 LICENSE 为准） | 样式框架（配 `@tailwindcss/vite ^4.0.0`） | 保留许可声明；已声明 |
| Motion | `^12.0.0` | `motiondivision/motion`（以官方为准） | MIT（以官方 LICENSE 为准） | 前端动效 | 保留许可声明；已声明 |
| Zustand | `^5.0.0` | `pmndrs/zustand` | MIT（以官方 LICENSE 为准） | 前端状态管理 | 保留许可声明；已声明 |
| PixiJS 8 | `^8.6.0` | `pixijs/pixijs` | MIT（以官方 LICENSE 为准） | 动态背景 / WebGL 渲染 | 保留许可声明；已声明 |
| react-router（react-router-dom） | `^7.1.0` | `remix-run/react-router` | MIT（以官方 LICENSE 为准） | 前端路由 | 保留许可声明；已声明 |
| lucide-react | `^0.468.0` | `lucide-icons/lucide` | ISC（以官方 LICENSE 为准） | 图标库 | 保留许可声明；已声明 |
| Tauri 2 | `@tauri-apps/api ^2.0.0`；Rust 侧 `tauri = "2"` / `tauri-build = "2"`（`Cargo.toml` 已落地） | `tauri-apps/tauri` | **待法务确认**（常见为 MIT / Apache-2.0 双重许可，以实际版本官方 LICENSE 为准） | 桌面外壳 / IPC 桥接 | 若随发行物分发需核对 Rust 侧 crate 许可；**源码已落地但未经编译验证**（受构建环境限制），Tauri/NSIS 安装包本阶段未生成 |
| Rust crates（版本见 `Cargo.toml`） | 已落地：`serde 1.0` / `serde_json 1.0` / `thiserror 1.0` / `uuid 1`（v5, serde）/ `sha2 0.10` / `roxmltree 0.20` / `rusqlite 0.32`（bundled, FTS5）/ `chrono 0.4` / `tokio 1` | 以各 crate 官方仓库为准 | **待法务确认**（各 crate 许可证与分发义务以官方 LICENSE 为准） | Rust 核心与 Tauri 桌面端依赖：序列化 / 错误处理 / UUID v5 / 内容指纹 / NFO 解析 / SQLite+FTS5 / 时间 / 异步 | `Cargo.toml` 与源码已落地，版本见工作区清单；**均未经编译验证**（受构建环境限制）；许可证与分发限制**待法务确认**，不得假定其许可或义务免除 |
| libmpv | **未获取、未集成** | `mpv-player/mpv`（以官方为准） | **待法务确认**（LGPL-2.1-or-later / GPL-2.0-or-later 取决于构建配置） | 播放器目标后端 | 目标后端，DLL 未获取；许可随构建选项变化，**待法务确认**；不得假定动态链接自动免除义务 |
| FFmpeg | **未集成、构建配置未定** | `FFmpeg/FFmpeg`（以官方为准） | **待法务确认**（LGPL-2.1-or-later / GPL-2.0-or-later 取决于 `configure`，启用 `--enable-gpl` / `--enable-nonfree` 时不同） | 目标解码/探测依赖 | 构建配置未定，专利与许可风险高，**待法务确认** |
| libplacebo | **未集成** | `haasn/libplacebo`（以官方为准） | **待法务确认** | 目标渲染/色彩处理依赖 | 目标组件，仓库中尚未引入；**待法务确认** |
| MiSans 字体 | 本机已安装，版本未记录 | 小米官方渠道（无公开代码仓库，以官方授权页为准） | **待法务确认**（专有免费许可，具体条款与再分发范围待核对） | UI / 字幕默认字体 | **系统字体文件不打包进仓库**（`.gitignore` 排除 `*.ttf/otf/woff/woff2`）；正式发行如需再分发须从官方渠道获取并遵守授权，**待法务确认** |
| NSIS | **未使用**（安装包本阶段未生成） | 以官方项目页为准 | **待法务确认** | 规划中的 Windows 安装器打包工具 | 安装包 **本阶段未生成**，交付安装包由 CI / Release 工作流在 `windows-latest` 上构建并把关；**待法务确认** |
| WebView2 | 运行时 156.0.4314.58（已安装） | 以 Microsoft 官方文档为准 | **待法务确认**（Microsoft 专有，可再分发组件有独立条款） | Tauri 外壳的 Web 运行时（随系统/可再分发） | **不打包 Runtime 本体进仓库**；再分发条款与版本匹配**待法务确认** |

### 其他前端开发期依赖（未在逐一清单内）

`vitest ^3.0.0`、`jsdom ^26.0.0`、`@testing-library/react ^16.2.0`、`@testing-library/jest-dom ^6.6.3`、`eslint ^9.17.0`、`typescript-eslint ^8.18.0`、`@eslint/js`、`eslint-plugin-react-hooks`、`eslint-plugin-react-refresh`、`globals`、`prettier ^3.6.2`、`sharp ^0.33.5`、`@vitejs/plugin-react ^4.3.4`、`@tailwindcss/vite ^4.0.0`、`@types/react ^19.0.0`、`@types/react-dom ^19.0.0`：均为**开发/构建/测试期依赖**，一般不随发行产物分发；各自许可证以官方 LICENSE 为准，**待法务确认**。

## 2. GPL 专项审查

| 项 | 内容 |
| --- | --- |
| 涉及组件 | FFmpeg（启用 `--enable-gpl` 时 GPL-2.0-or-later）、libmpv（含 GPL 组件时 GPL-2.0-or-later）、可能的 GPL 滤镜/解码器 |
| 风险点 | GPL 的著佐权 / 传染性：分发衍生作品二进制时可能需以 GPL 提供对应源代码、保留许可证与版权声明，并允许接收者再分发 |
| 关键原则 | **不能假定动态链接自动免除许可证义务**；是否构成衍生作品、静态/动态链接、进程边界、mere aggregation 等需按具体司法辖区与授权文本判定 |
| 当前结论 | 相关组件**未集成、构建配置未定**；**待法务确认**。在配置确定前不得假定 LGPL 或免义务 |
| 行动项 | 确定 FFmpeg / libmpv 的构建开关与 GPL 组件清单 → 法务核对分发义务 → 落实源码提供、许可证与声明文件 |

## 3. LGPL 专项审查

| 项 | 内容 |
| --- | --- |
| 涉及组件 | libmpv（LGPL-2.1-or-later 构建）、libplacebo、部分 FFmpeg（LGPL-2.1-or-later 构建） |
| 典型义务 | 动态链接时需保证库可被替换 / 可重新链接；对库本身的修改需开源；提供许可证文本、版权声明与获取源代码的途径；不得通过技术手段限制逆向调试以替换库 |
| 关键原则 | **不能假定动态链接自动免除许可证义务**。LGPL 是有条件的例外，仍需满足通知、可替换性、修改开源、声明保留等条件 |
| 当前结论 | 组件未集成、许可证版本与构建方式未定；**待法务确认** |
| 行动项 | 明确使用 LGPL 还是 GPL 构建 → 核对可替换性与声明义务 → 准备 NOTICE / 源码获取说明 |

## 4. 专利专项审查

| 项 | 内容 |
| --- | --- |
| 涉及技术 | H.264 / H.265(HEVC) / AV1 视频编解码；AC-3 / E-AC-3 / E-AC-3 JOC / TrueHD / Atmos / DTS / DTS-HD MA / DTS:X 音频；Dolby Vision；相关容器与传输 |
| 风险点 | 编解码器与传输技术涉及专利池 / 授权组织，分发编解码器或启用相关功能可能触发专利许可与版税义务；专利授权与开源许可证是**两回事**，开源许可不当然覆盖专利 |
| 当前结论 | 本项目**未获得相关专利授权**，也未确认任何专利许可覆盖范围；**待法务确认** |
| 行动项 | 由法务核对目标市场专利池与授权要求；确认编解码器来源（系统组件 / 自行分发）及其许可状态 |

## 5. 商标专项审查

| 项 | 内容 |
| --- | --- |
| 涉及商标 | Dolby、Dolby Vision、Dolby Atmos、DTS、DTS:X、HDR10+ 等第三方商标与 Logo |
| 现状 | 本项目**未使用任何第三方官方 Logo**，文中相关名称仅为**技术格式的中性指称**；**未获得 Dolby / DTS 任何官方认证** |
| 限制 | 未经授权不得在界面、图标、发行说明、营销材料中使用官方 Logo 或暗示认证 / 背书 / 兼容性认证 |
| 当前结论 | **待法务确认**；在授权取得前维持「不使用 Logo、不宣称认证」 |

## 6. Dolby 技术授权专项审查

- Dolby Vision / Dolby Atmos 的**解码、渲染、认证、Logo 使用**均需与 Dolby 单独授权；开源组件或第三方解码器不当然授予这些权利。
- **Dolby 商标与技术需单独授权，本项目未获授权**。本项目**未获得 Dolby 官方认证、未使用 Dolby 官方 Logo**。
- 本项目对 DV / Atmos / HDR / 音频直通的所有能力状态均为**未验证、未实测**（见 `docs/dolby-compatibility/*`、`docs/playback/windows-surface-validation.md`）。「未验证」不等于「不支持」，但**不得据此宣称支持**。
- 行动项：如未来需宣称兼容、使用认证或 Logo，必须先取得 Dolby 授权并完成实机验证与证据归档；在此之前维持现状。

## 7. 总体结论与待办

1. **项目自身开源许可证尚未确定**，仓库仅为代码审查公开，未授权第三方复制、修改或分发（见 `docs/adr/0006-license-status.md`）。
2. **不能假定动态链接自动免除许可证义务**；GPL / LGPL 组件的具体义务取决于构建配置与链接方式，**待法务确认**。
3. **Dolby 商标与技术需单独授权，本项目未获授权**；未获认证、未使用官方 Logo、不宣称支持。
4. 所有标注「待法务确认」的条目，在正式发行前必须完成核对并补齐 NOTICE / 源码提供 / 声明文件；**不得编造许可证名称或授权范围**。
5. 组件落地状态须与依赖清单一致：Rust crates 与 `Cargo.toml` 源码已落地但**未经编译验证**（受构建环境限制）、libmpv / FFmpeg / libplacebo 未集成、NSIS 未使用、MiSans 未打包、WebView2 仅运行时存在；Tauri/NSIS 安装包本阶段**未生成**（由 CI / Release 构建）。
