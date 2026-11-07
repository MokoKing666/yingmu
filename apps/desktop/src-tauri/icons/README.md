# 应用图标

本团队（media-core）**不创建、不提交任何二进制图标文件**：目录中的
`.ico` / `.png` 等文件若已存在，均由 `scripts/generate-icons.mjs` 生成，
属于图标生成团队的产物，本团队只引用、不改动、不删除。

图标生成脚本位于仓库根目录 `scripts/generate-icons.mjs`（其他团队所有权），
通过 `npm run brand:icons` 触发。`tauri.conf.json` 中 `bundle.icon` 指向
`icons/icon.ico`，因此构建前必须先生成图标：

```bash
npm run brand:icons     # 由 scripts/generate-icons.mjs 生成图标
cargo tauri build       # 编译期 tauri::generate_context!() 会读取 icons/icon.ico
```

若跳过图标生成，`tauri-build` / `generate_context!` 在编译期读取图标会失败。

Windows 构建至少需要（尺寸由生成脚本决定，此处仅列约定）：

- `icon.ico`：内嵌 16/32/48/64/128/256 px 多尺寸，供窗口图标与 NSIS 安装包；
- `icon.png`：-square 源图，供其他平台与文档引用；
- 可选 `Square30x30Logo.png` 等磁贴/开始菜单资源。

图标设计需符合 `packages/design-tokens` 的品牌规范。生成脚本与二进制产物均不在
本团队所有权内；本文件只说明依赖与前置步骤，不生成、不提交图标。
