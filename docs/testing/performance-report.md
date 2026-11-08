# 全幅拼贴幕墙 — 性能与适配实测报告

> 数据来源：本仓库 `apps/desktop/src/test/mosaic-layout.test.ts` 的 Vitest 实测输出，
> 以及 `scripts/capture-screenshots.mjs` 在真实运行的 `vite preview` + Edge 无头实例上的
> DOM 探测（`docs/design/screenshots/viewport-probe.json`）。
> 本报告只记录**实际测得**的数字，不以 DOM 数量或单次耗时宣称「60 FPS」。

## 1. 布局引擎耗时与首屏挂载量

测试机：本机 Windows，Node 22.22.2，Vitest 3.2.7，`canvasWidth = 1920`。
`firstScreenMounted` 按「1080px 视口 + 上下各 700px overscan」模拟可见区间统计。
数据由 `stress(n)` 复制演示条目生成唯一 Media ID，不使用重复对象引用。

| 条目数 | 一次完整布局耗时 | 画布高度 | 首屏挂载磁贴 | 不同宽度值数量 |
|---:|---:|---:|---:|---:|
| 40 | 0.32 ms | 3,990 px | 16 | 39 |
| 200 | 3.07 ms | 15,083 px | 19 | 145 |
| 500 | 5.62 ms | 38,292 px | 16 | 262 |
| 1000 | 12.99 ms | 75,425 px | 18 | 352 |

结论：

- 布局耗时随条目数近似线性增长，1000 条约 13 ms，远低于一帧预算。
- **首屏挂载量与总条目数无关**（16–19 个），因为渲染层按绝对 y 坐标裁剪，
  而不是把 1000 个节点全部挂到 DOM 上；这是真正的可见区域虚拟化，
  旧版「每批追加 24 个」只是增量渲染，不属于虚拟化。
- 不同宽度值数量持续上升（40 条时 39 种、1000 条时 352 种），
  说明尺寸是连续计算而非固定六档。

## 2. 四种分辨率 / 画布适配

`canvasWidth` 取 1280 / 1920 / 2560 / 3440，对应 1280×720、1920×1080、
2560×1440、3440×1440 四种窗口。每项都跑了 `validateMosaic`（零重叠 + 右边界检查）。

| 画布宽 | 画布高 | 磁贴数 | 最大/最小面积比 | 右边界溢出 | 重叠 |
|---:|---:|---:|---:|:---:|:---:|
| 1280 | 3,413 | 52 | 15.5× | 无 | 0 |
| 1920 | 5,032 | 52 | 15.2× | 无 | 0 |
| 2560 | 5,040 | 52 | 14.3× | 无 | 0 |
| 3440 | 4,436 | 52 | 27.5× | 无 | 0 |

超宽屏（3440）上面积反差扩大到 27.5 倍，说明尺寸层次没有被拉平；
所有分辨率均无水平溢出、无磁贴重叠。

## 3. Windows 显示缩放（逻辑视口模拟）

Windows 125% 缩放时物理像素不变、**CSS 视口变窄**（1600 物理 → 1280 CSS）。
因此用等比例缩小的 `--window-size` 模拟不同缩放下的逻辑视口，对真实运行实例
做 `--dump-dom` 探测，读取 `.mosaic` 的 `data-canvas-width` / `data-mounted`。

| 模拟缩放 | 逻辑视口 | 实测画布宽 | 首屏挂载 |
|---:|---|---:|---:|
| 100% | 1600×1000 | 1570 px | 25 |
| 125% | 1280×800 | 1250 px | 31 |
| 150% | 1067×667 | 1037 px | 31 |
| 200% | 800×500 | 770 px | 28 |

四档均随视口变窄重新编排，画布宽始终等于可用 CSS 宽度，未出现溢出或挤压；
窄视口下磁贴变小、首屏可容纳更多（25 → 31），符合连续尺寸的预期。

> **必须说明的边界**：这是逻辑视口模拟，**不是**在真实 Windows
> 「显示设置 → 缩放」下验证。Edge 无头模式的 `--force-device-scale-factor`
> 实测只改变输出位图密度、不改变 CSS 视口宽（四档均为 1570px），
> 因此本报告不把它当作 DPI 验证。真实 Windows 缩放下的观感需人工在桌面端确认。

CSS 侧使用 `clamp()` 连续尺寸、`object-fit: cover` 裁切、绝对定位 + transform，
不依赖固定像素列宽；布局引擎以 `clientWidth`（CSS 像素）为输入。
`.page-scroll` 保持 `overflow-x: hidden`，幕墙页左右 padding 为 0，不产生水平滚动条。

## 4. 已落实的性能策略

| 策略 | 实现位置 |
|---|---|
| 图片懒加载 | `LazyImage` + `useInView`（rootMargin 700px）+ `loading="lazy"` / `decoding="async"` |
| 缩略图多尺寸缓存 | `useArtwork` 按 `box.width` 选 sm/md/lg/xl；WebDemoBridge 用 `getArtwork` 内存缓存 |
| 可见区域渲染 | `MasonryWall` 按 `box.y` 与滚动区间过滤，容器高度固定为 `canvasHeight` |
| 避免不必要重渲染 | `MediaTile` 用 `memo`；布局 `useMemo` 只依赖 items / customOrder / canvasWidth / focal |
| 避免频繁重算 | ResizeObserver 回调合并到一帧；滚动区间按 160px 台阶量化后才 setState |
| 拖拽期间不重排 | dragover 只更新高亮 id，布局 memo 不失效；drop 时才写 customOrder |
| 尊重减少动态效果 | `@media (prefers-reduced-motion: reduce)` 关闭 slot / art / tile 过渡 |
| 资源释放 | 卸载磁贴时 `img` 随 DOM 移除；`useArtwork` 的 effect 有 active 标记取消异步更新 |

## 5. 尚未实测的部分（如实标注）

- 未在真实设备上做逐帧 FPS 采样；上表是布局耗时与挂载量，不是帧率。
- 未做长时间播放/滚动的内存曲线采集。
- 1000 条压力测试用的是程序合成的条目（复用 48 张演示封面），
  不是 1000 个真实媒体文件；真实扫描与刮削性能需 Tauri 桌面端接通后另测。
