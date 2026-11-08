# ADR 0008 — v0.3 品牌视觉重设计与前端/ Rust 依赖现代化

- 状态：已接受
- 日期：2026-11-08
- 相关：`packages/design-tokens/src/tokens.ts`、`tokens.css`、`scripts/check-contrast.mjs`、`apps/desktop/package.json`、`Cargo.toml`

## 背景

v0.2 的品牌色是琥珀金 `#D9A55B` + 暖白 `#F2EFE9` + 米黄浅色背景 `#F7F6F3`。
实际使用后确认四个问题：

1. 金色出现频率过高（徽标、收藏、进度、焦点、发光阴影同时抢注意力），
   UI 与电影海报争夺视觉主体。
2. 整体气质偏「传统商务软件」，与"电影艺术馆"的定位不符。
3. 浅色主题偏米黄/奶油，不够清爽。
4. `wall.css` 对全部海报施加 `filter: brightness(1.55) saturate(1.2)`，
   破坏影片本身的明暗层次与色彩分级。

同时前端工具链停留在 Vite 6 / TypeScript 5.7 / ESLint 9 / Vitest 3，
Rust 侧 `rusqlite 0.32` 落后于当前稳定线，且 `rust-version = "1.77.2"`
与 Tokio 1.54 要求的 1.85 不一致（声明与实际依赖矛盾）。

## 决策一：Cinematic Neutral 品牌体系

- 深色：Cinematic Graphite（`#0B0F14` 基座 + 4 级中性面，避免纯黑与面板边框泛滥）。
- 浅色：Silver Screen（`#F4F7FA` 银白，不再是米黄）。
- 强调：Glacier Blue（深色 `#77B8D8` / `#A0D0E8` / `#477F9F` / `#16252F`，
  浅色 `#3C6F8B` / `#77B8D8` / `#2A566E` / `#DDEFF7`），
  只用于选中、焦点、主操作与少量关键进度。
- 语义色与强调色解耦：Success 绿 / Warning 琥珀（仅警告）/ Danger 红 /
  Favorite 独立克制的红 / Info 低饱和蓝。**深浅各一套值**——同一支绿在深底与白底
  不可能同时满足 4.5:1，只写一套等于必有一边不达标。
- 移除全局图片滤镜：**图片颜色必须来自影片本身**；只在文字所在区域保留 scrim。
- 演示素材也按冷调重绘：生成器 16 组色板里有 3 组是琥珀/棕调（沙漠赭、钨丝室内、
  暖棕），占了墙面上可见封面的多数，会让整面墙看起来仍是暖色品牌。这 3 组换成
  高原寒蓝 / 冷白室内 / 雾蓝，保留 2 组暖色用于题材区分。

**浅色主题的强调色做了可访问性映射**：`#77B8D8` 放在 `#F4F7FA` 上只有约 2.2:1，
不能用于文字，因此浅色主题的 `--accent` 使用加深的 `#3C6F8B`（5.09:1），
`--accent-soft` 才保留 `#77B8D8` 供填充/描边使用。这是同一色系的可访问性映射，
不是另一套品牌色。

**对比度不是凭感觉判断**：`scripts/check-contrast.mjs` 直接解析 `tokens.css`
（浏览器实际拿到的值），按 WCAG 2.2 AA 计算两套主题的配对
（v0.3.1 起扩到 32 组/主题，覆盖真实组件：输入框、按钮各态、焦点环、语义徽标、
进度条、压在封面 scrim 与播放器玻璃遮罩上的文字）。
最终 0 项不达标（正文 4.5:1、非文本 3:1）。

## 决策二：前端工具链

| 组件 | 升级前 | 升级后 | 说明 |
|---|---|---|---|
| Vite | 6.4.5 | **8.3.6** | Rolldown 统一构建；`manualChunks` 对象映射被移除，改为函数形式 |
| @vitejs/plugin-react | 4.3.4 | **6.2.1** | 目标 6.1.2 已非最新，取当前稳定 6.2.1；3 个额外 peer 均为 optional |
| TypeScript | 5.7 | **6.0.3** | 正式基线；`baseUrl` 被弃用，已删除并依赖 paths 相对 tsconfig 解析 |
| Tailwind CSS / @tailwindcss/vite | 4.0 | **4.3.5** | 保持 v4，未回退 v3 |
| Vitest | 3.0 | **5.1.0** | 与 Vite 8 匹配 |
| jsdom | 26 | **31.0.0** | Vitest 5 环境 |
| ESLint | 9.17 | **10.14.0** | 9 已 EOL；flat config 继续使用 |
| typescript-eslint | 8.18 | **8.72.1** | peer `typescript >=4.8.4 <6.1.0` |
| eslint-plugin-react-hooks | 5.1 | **7.1.1** | 新增 `set-state-in-effect` 等规则 |
| @eslint/js | 9.17 | **10.0.1** | 注意：`@eslint/js` 的版本号与 `eslint` 本体不同步 |
| globals | 15.14 | **17.14.0** | |
| Motion | 12.0 | **14.10.1** | 继续使用 `motion/react` 入口，未引入 framer-motion |
| Zustand | 5.0 | **5.1.0** | |
| PixiJS | 8.6 | **8.22.0** | 仅用于动态背景 |
| lucide-react | 0.468 | **1.70.0** | 图标名向后兼容，typecheck 无缺失 |
| react-router-dom | 7.1 | **7.18.5** | |
| @tauri-apps/api | 2.0 | **2.12.4** | 与 Tauri 2.12.5 同一条版本线 |

### TypeScript 7 的结论：暂不纳入正式构建

`typescript@7.0.2` 已发布，但 `typescript-eslint@8.72.1` 的 peer 明确是
`>=4.8.4 <6.1.0`。把 TS 7 塞进正式检查会破坏 ESLint 生态，
因此：

- 正式基线锁定 `~6.0.3`；
- **未**使用 `--force` / `--legacy-peer-deps` 绕过 peer 检查；
- TS 7 仅作为后续实验项记录，不阻塞构建。

### Node 基线

- CI 正式矩阵：Node **26**（Active LTS）+ Node **24**（Maintenance LTS）。
- `engines` 声明 `^22.13.0 || ^24.0.0 || >=26.0.0`：
  Vite 8 / Vitest 5 / ESLint 10 的 engines 都接受 22.12+，因此本机 Node 22.22
  仍可做本地快速验证；正式发布与 CI 以 24/26 为准。
- Node 27 处于 Alpha，不作为构建基线。
- `.nvmrc` 写 26。

### 升级中发现并修复的真实问题

1. **Vite 双实例**：根 `node_modules/vite` 残留 6.4.5，与 `apps/desktop` 的 8.3.6
   并存，导致 `Plugin` 类型不兼容。`npm dedupe` 统一为单一 8.3.6。
2. **`manualChunks` 类型变化**：Vite 8 只接受函数形式，对象映射报 TS2769。
3. **TS 6 弃用 `baseUrl`**：删除后 `paths` 相对 tsconfig 解析，行为不变。
4. **TS 6 新增副作用 CSS 导入检查**：`types` 加入 `vite/client`。
5. **lib.dom 新增 `IntersectionObserver.scrollMargin`**：测试替身补齐该只读属性。
6. **react-hooks 7 的 `set-state-in-effect`**：5 处真实级联渲染（useArtwork、
   useInView、SearchPage、MetadataEditPage）改用派生状态修复，**没有关闭规则**。

## 决策三：Rust 依赖与 MSRV

| crate | 升级前 | 升级后 | 说明 |
|---|---|---|---|
| MSRV | 1.77.2 | **1.85** | 与 Tokio 1.54 的真实要求一致；CI stable 工具链满足 |
| rusqlite | 0.32.1 | **0.41.1** | 对应 libsqlite3-sys 0.39.1；`bundled` 编译 amalgamation |
| thiserror | 1.0.69 | **2.0.21** | core 使用 2.x；Tauri 依赖链仍保留 1.x，两者共存互不影响 |
| sha2 | 0.10.9 | **0.11.1** | 内容指纹 SHA-256 |
| roxmltree | 0.20.0 | **0.21.2** | NFO 只读解析 |
| tokio | 1.54.1 | 保持 | 已是最新稳定线，不为版本数字而升级 |
| serde / serde_json / uuid / chrono | — | 保持 | 已在稳定线 |

**rusqlite 特性核对**：`features = ["bundled"]` 会随 crate 编译 SQLite
amalgamation（libsqlite3-sys 的 bundled 构建启用 FTS5）。但"加了 bundled"
不等于"FTS5 已验证"——真正的验证是 `cargo test -p yingmu-core` 里
`fts_triggers_keep_index_in_sync_and_search_paginates` 等用例在 CI 上通过，
以及 `002_fts5.sql` 迁移能真实执行。该验证由 CI 的 rust job 承担。

`Cargo.lock` 已提交，锁定上述版本。

## 被拒绝的做法

| 做法 | 拒绝理由 |
|---|---|
| 只改一个主色变量就宣称完成品牌重设计 | 用户明确禁止；且 79 处旧色引用会残留 |
| 用 `--force` / `--legacy-peer-deps` 装 Vite 8 + Vitest 3 | 会掩盖真实的 peer 冲突，留下不可复现环境 |
| 把 TypeScript 7 硬塞进正式检查 | 破坏 typescript-eslint peer 契约 |
| 关闭 `react-hooks/set-state-in-effect` 让 CI 变绿 | 掩盖真实级联渲染问题；应改代码模式 |
| 用 `skipLibCheck` 掩盖自己代码的错误 | `skipLibCheck` 只跳过第三方 `.d.ts`，不能替代源码类型检查 |
| 直接删 `node_modules` 重装来解决双实例 | 本机 safe-delete 会拦截；`npm dedupe` 已足够 |

## 后果

正面：

- 视觉主体重新回到海报本身；深浅主题都通过 WCAG AA 实测。
- 构建时间显著下降（Vite 8/Rolldown 生产构建约 1.4s，v0.2 约 5.5s）。
- 工具链回到当前稳定线，Dependabot 可以持续跟进。
- MSRV 声明与依赖真实要求一致，CI 可验证。

负面 / 待观察：

- rusqlite 0.32 → 0.41 跨 9 个 minor，API 兼容性依赖 CI 的 `cargo test` 验证；
  本机受链接器遮蔽与 safe-delete 限制无法本地编译。
- Node 22 仍在 `engines` 范围内，团队本地与 CI（24/26）存在版本差，
  需在 CONTRIBUTING 里明确"CI 为准"。
- Motion 12 → 14、lucide 0.468 → 1.70 均为大版本跳跃，
  目前 typecheck/test 通过，但运行时动画细节仍需人工目视确认。
