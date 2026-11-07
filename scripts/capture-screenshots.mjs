/**
 * 影幕 — 真实界面截图工具
 *
 * 使用本机 Edge 无头模式访问 `vite preview` 的真实运行实例，截图来自真实软件，
 * 不是概念图 / 设计稿。Windows 上 Edge 是 GUI 子系统程序，直接 spawn 会丢失
 * stdio 并提前返回，因此通过 powershell.exe 的同步 `&` 调用来等待浏览器进程结束。
 *
 * 前置：`npm run build && npm run preview`（默认 http://127.0.0.1:4173）
 * 用法：`node scripts/capture-screenshots.mjs [baseUrl]`
 * 输出：`docs/design/screenshots/*.png`
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'docs/design/screenshots');
const PROFILE_BASE = resolve(process.env.TEMP ?? 'C:\\Windows\\Temp', 'yingmu-edge-shot');
const BASE = process.argv[2] ?? 'http://127.0.0.1:4173';
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

const COMMON = [
  '--headless',
  '--disable-gpu',
  '--no-first-run',
  '--no-default-browser-check',
  '--hide-scrollbars',
  '--window-size=1600,1000',
  '--virtual-time-budget=10000',
];

/** 同步调用 Edge 并返回合并后的输出（Edge 的 dump-dom 走 stderr，必须 2>&1） */
function runEdge(args) {
  const quote = (value) => `'${String(value).replace(/'/g, "''")}'`;
  const command = `& ${quote(EDGE)} ${args.map(quote).join(' ')} 2>&1 | Out-String`;
  const result = spawnSync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', command],
    { encoding: 'utf8', timeout: 90_000, windowsHide: true, maxBuffer: 32 * 1024 * 1024 },
  );
  if (result.error) console.error('调用 Edge 失败：', result.error.message);
  return result.stdout ?? '';
}

function capture(name, url) {
  const target = resolve(OUT, `${name}.png`);
  runEdge([...COMMON, `--user-data-dir=${PROFILE_BASE}-${name}`, `--screenshot=${target}`, url]);
  const ok = existsSync(target) && statSync(target).size > 10_000;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}.png ${ok ? `${Math.round(statSync(target).size / 1024)} KB` : '（未生成或过小）'}`);
  return ok;
}

/** 从真实渲染后的 DOM 中读取第一个 Media ID（稳定 ID 由内容指纹派生，运行时才能取到） */
function firstMediaId() {
  const dom = runEdge([...COMMON, `--user-data-dir=${PROFILE_BASE}-dom`, '--dump-dom', `${BASE}/#/`]);
  const match = dom.match(/data-media-id="([^"]+)"/);
  const tiles = (dom.match(/data-media-id=/g) ?? []).length;
  console.log(`运行时 DOM 磁贴数：${tiles}；首个 Media ID：${match?.[1] ?? '未取得'}`);
  return match?.[1];
}

const id = firstMediaId();
const shots = [
  ['home-dark', `${BASE}/#/`],
  ['home-light', `${BASE}/#/?theme=light`],
  ['library-movie', `${BASE}/#/library/movie`],
  ['search', `${BASE}/#/search?q=${encodeURIComponent('雾港')}`],
  ['settings', `${BASE}/#/settings`],
  ['sources', `${BASE}/#/sources`],
];
if (id) {
  shots.push(['detail', `${BASE}/#/detail/${id}`]);
  shots.push(['player', `${BASE}/#/player/${id}`]);
}

let failures = 0;
for (const [name, url] of shots) {
  if (!capture(name, url)) failures += 1;
}
console.log(`\n截图完成：${shots.length - failures}/${shots.length} 成功，输出目录 ${OUT}`);
if (failures > 0) process.exitCode = 1;
