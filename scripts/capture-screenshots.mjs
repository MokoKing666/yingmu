/**
 * 影幕 — 真实界面截图工具（v0.2 全幅拼贴版）
 *
 * 使用本机 Edge 无头模式访问 `vite preview` 的真实运行实例，截图来自真实软件，
 * 不是概念图 / 设计稿。Windows 上 Edge 是 GUI 子系统程序，直接 spawn 会丢失
 * stdio 并提前返回，因此通过 powershell.exe 的同步 `&` 调用来等待浏览器进程结束。
 *
 * 前置：`npm run build && npm run preview`（默认 http://127.0.0.1:4173）
 * 用法：`node scripts/capture-screenshots.mjs [baseUrl]`
 * 输出：`docs/design/screenshots/*.png` 与 `docs/design/screenshots/viewport-probe.json`
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'docs/design/screenshots');
const PROFILE_BASE = resolve(process.env.TEMP ?? 'C:\\Windows\\Temp', 'yingmu-edge-shot');
const BASE = process.argv[2] ?? 'http://127.0.0.1:4173';
const DEFAULT_SIZE = '1600,1000';
const ULTRAWIDE_SIZE = '3440,1440';
const EDGE_CANDIDATES = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
];
const EDGE = EDGE_CANDIDATES.find((p) => existsSync(p));

if (!EDGE) {
  console.error('未找到 Edge，无法生成真实截图。');
  process.exit(1);
}

mkdirSync(OUT, { recursive: true });

function common(windowSize, dpi) {
  return [
    '--headless',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--hide-scrollbars',
    `--window-size=${windowSize}`,
    ...(dpi ? [`--force-device-scale-factor=${dpi}`] : []),
    '--virtual-time-budget=10000',
  ];
}

/** 同步调用 Edge 并返回合并后的输出（Edge 的 dump-dom 走 stderr，必须 2>&1） */
function runEdge(args) {
  const quote = (value) => `'${String(value).replace(/'/g, "''")}'`;
  const command = `& ${quote(EDGE)} ${args.map(quote).join(' ')} 2>&1 | Out-String`;
  const result = spawnSync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', command],
    { encoding: 'utf8', timeout: 120_000, windowsHide: true, maxBuffer: 32 * 1024 * 1024 },
  );
  if (result.error) console.error('调用 Edge 失败：', result.error.message);
  return result.stdout ?? '';
}

function capture(name, url, windowSize = DEFAULT_SIZE, extraFlags = []) {
  const target = resolve(OUT, `${name}.png`);
  const args = [
    ...common(windowSize),
    ...extraFlags,
    `--user-data-dir=${PROFILE_BASE}-${name}`,
    `--screenshot=${target}`,
    url,
  ];
  // 每张截图都是**冷启动**（独立的 user-data-dir），首屏 15 张 SVG 封面还在解码时
  // 截图就已经落盘，会出现「磁贴已挂载但封面空白」的假象。先跑一遍把资源写进该
  // profile 的磁盘缓存，再跑第二遍取图；两次都是同一台机器上的真实渲染。
  runEdge(args);
  runEdge(args);
  const ok = existsSync(target) && statSync(target).size > 10_000;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}.png ${ok ? `${Math.round(statSync(target).size / 1024)} KB` : '（未生成或过小）'}`);
  return ok;
}

/** 从真实渲染后的 DOM 读取首个 Media ID 与画布诊断数据 */
function domProbe(tag, url, windowSize = DEFAULT_SIZE, dpi) {
  const dom = runEdge([
    ...common(windowSize, dpi),
    `--user-data-dir=${PROFILE_BASE}-${tag}`,
    '--dump-dom',
    url,
  ]);
  const match = dom.match(/data-media-id="([^"]+)"/);
  const canvas = dom.match(/data-canvas-width="(\d+)"/);
  const mounted = dom.match(/data-mounted="(\d+)"/);
  return {
    firstMediaId: match?.[1] ?? null,
    canvasWidth: canvas ? Number(canvas[1]) : null,
    mountedTiles: mounted ? Number(mounted[1]) : null,
    tileNodes: (dom.match(/data-media-id=/g) ?? []).length,
  };
}

const home = domProbe('home', `${BASE}/#/`);
console.log(`运行时 DOM：磁贴节点 ${home.tileNodes}，挂载 ${home.mountedTiles}，画布 ${home.canvasWidth}px，首个 ID ${home.firstMediaId}`);

/**
 * Windows 显示缩放的**逻辑视口模拟**：
 * Windows 125% 缩放时物理像素不变、CSS 视口变窄（1600 物理 → 1280 CSS），
 * 因此用等比例缩小的 --window-size 来检验布局在窄逻辑视口下是否溢出。
 * 注意：这不是在真实 Windows「显示设置 → 缩放」下验证，Edge 无头模式的
 * --force-device-scale-factor 只改变输出位图密度、不改变 CSS 视口宽度
 * （实测四档均为 1570px），故本报告不把它当作 DPI 验证。
 */
const dpiProbe = [1, 1.25, 1.5, 2].map((scale) => {
  const w = Math.round(1600 / scale);
  const h = Math.round(1000 / scale);
  const result = domProbe(`dpi-${scale}`, `${BASE}/#/`, `${w},${h}`);
  return { scale: `${Math.round(scale * 100)}%`, simulatedCssViewport: `${w}x${h}`, ...result };
});
console.log('逻辑视口探测：', dpiProbe.map((p) => `${p.scale}→${p.simulatedCssViewport}/画布${p.canvasWidth ?? '-'}px`).join('  '));
writeFileSync(
  resolve(OUT, 'viewport-probe.json'),
  JSON.stringify({ base: BASE, defaultWindow: DEFAULT_SIZE, ultrawideWindow: ULTRAWIDE_SIZE, home, dpiProbe }, null, 2),
);

const shots = [
  ['home-dark', `${BASE}/#/`, DEFAULT_SIZE],
  ['home-light', `${BASE}/#/?theme=light`, DEFAULT_SIZE],
  ['library-movie', `${BASE}/#/library/movie`, DEFAULT_SIZE],
  ['library-tv', `${BASE}/#/library/tv`, DEFAULT_SIZE],
  // 动画库：验证不同媒体库的排序/排列作用域互不污染
  ['library-anime', `${BASE}/#/library/anime`, DEFAULT_SIZE],
  // 自定义排列：?sort= 强制排序模式，验证 Segmented 的「自定义排列」态
  ['custom-sort', `${BASE}/#/library/movie?sort=custom`, DEFAULT_SIZE],
  ['nav-collapsed', `${BASE}/#/library/anime`, DEFAULT_SIZE],
  ['nav-expanded', `${BASE}/#/?nav=open`, DEFAULT_SIZE],
  ['ultrawide', `${BASE}/#/`, ULTRAWIDE_SIZE],
  // 小窗口：960×600 下磁贴连续尺寸与安全区收敛是否正常
  ['small-window', `${BASE}/#/`, '960,600'],
  // 减少动态效果：Chromium 强制 prefers-reduced-motion，验证动效关闭后的静态状态
  ['reduced-motion', `${BASE}/#/`, DEFAULT_SIZE, ['--force-prefers-reduced-motion']],
  ['search', `${BASE}/#/search?q=${encodeURIComponent('雾港')}`, DEFAULT_SIZE],
  ['settings', `${BASE}/#/settings`, DEFAULT_SIZE],
  ['sources', `${BASE}/#/sources`, DEFAULT_SIZE],
];
if (home.firstMediaId) {
  shots.push(['detail', `${BASE}/#/detail/${home.firstMediaId}`, DEFAULT_SIZE]);
  shots.push(['player', `${BASE}/#/player/${home.firstMediaId}`, DEFAULT_SIZE]);
}

let failures = 0;
for (const [name, url, size, flags] of shots) {
  if (!capture(name, url, size, flags ?? [])) failures += 1;
}
console.log(`\n截图完成：${shots.length - failures}/${shots.length} 成功，输出目录 ${OUT}`);
if (failures > 0) process.exitCode = 1;
