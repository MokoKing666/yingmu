#!/usr/bin/env node
/**
 * WCAG 2.2 对比度实测。
 *
 * 数据源：packages/design-tokens/src/tokens.css（纯文本，直接解析 CSS 变量），
 * 因此检查的就是浏览器实际拿到的值，而不是 TS 里另抄一份。
 *
 * 阈值：正文/次级/辅助文字与强调色文字 4.5:1（AA），
 *       图标/边框/语义徽标 3:1（AA 非文本对比）。
 *
 * 用法：node scripts/check-contrast.mjs
 * 退出码：0 全部通过；1 存在不达标配对。
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const css = readFileSync(resolve(ROOT, 'packages/design-tokens/src/tokens.css'), 'utf8');

function parseBlock(source) {
  const vars = new Map();
  for (const m of source.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/gi)) {
    vars.set(m[1], m[2].trim());
  }
  return vars;
}

// 注意：文件头部注释里也出现了 [data-theme='light'] 字样，
// 必须以「行首的选择器」定位，否则会把注释当成块起点。
const lightMatch = /\n\[data-theme='light'\]\s*\{/.exec(css);
if (!lightMatch) {
  console.error("未找到行首的 [data-theme='light'] 块");
  process.exit(1);
}
const lightIdx = lightMatch.index;
const darkVars = parseBlock(css.slice(0, lightIdx));
const lightVars = parseBlock(css.slice(lightIdx));

function toRgb(value) {
  const hex = value.trim();
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

const linear = (c) => {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};

function luminance(rgb) {
  return 0.2126 * linear(rgb.r) + 0.7152 * linear(rgb.g) + 0.0722 * linear(rgb.b);
}

function contrast(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

/** [前景, 背景, 阈值, 说明] */
const TEXT_PAIRS = [
  ['--text-primary', '--bg-base', 4.5, '主文字 / 页面背景'],
  ['--text-primary', '--surface', 4.5, '主文字 / 普通表面'],
  ['--text-primary', '--bg-elevated', 4.5, '主文字 / 浮层'],
  ['--text-secondary', '--bg-base', 4.5, '次级文字 / 页面背景'],
  ['--text-secondary', '--surface', 4.5, '次级文字 / 普通表面'],
  ['--text-tertiary', '--bg-base', 4.5, '辅助文字 / 页面背景'],
  ['--text-tertiary', '--surface', 4.5, '辅助文字 / 普通表面'],
  ['--accent', '--bg-base', 4.5, '强调色文字 / 页面背景'],
  ['--accent', '--surface', 4.5, '强调色文字 / 普通表面'],
  ['--accent-on', '--accent', 4.5, '按钮文字 / 强调色底'],
  ['--semantic-success', '--bg-base', 4.5, '成功色文字 / 页面背景'],
  ['--semantic-warning', '--bg-base', 4.5, '警告色文字 / 页面背景'],
  ['--semantic-danger', '--bg-base', 4.5, '危险色文字 / 页面背景'],
  ['--semantic-favorite', '--bg-base', 4.5, '收藏色文字 / 页面背景'],
  ['--semantic-info', '--bg-base', 4.5, '信息色文字 / 页面背景'],
];

const UI_PAIRS = [
  ['--border', '--bg-base', 1.2, '普通边框（仅需可见，不作文字）'],
  ['--border-strong', '--bg-base', 1.5, '强调边框'],
  ['--accent', '--bg-base', 3, '焦点环 / 选中指示'],
  ['--text-tertiary', '--bg-elevated', 4.5, '辅助文字 / 浮层'],
];

function run(themeName, vars) {
  const rows = [];
  let failed = 0;
  const check = (pairs) => {
    for (const [fg, bg, min, label] of pairs) {
      const f = toRgb(vars.get(fg) ?? '');
      const b = toRgb(vars.get(bg) ?? '');
      if (!f || !b) {
        rows.push({ label, fg, bg, ratio: NaN, min, pass: false, note: '无法解析颜色' });
        failed += 1;
        continue;
      }
      const ratio = contrast(f, b);
      const pass = ratio >= min;
      if (!pass) failed += 1;
      rows.push({ label, fg, bg, ratio, min, pass });
    }
  };
  check(TEXT_PAIRS);
  check(UI_PAIRS);

  console.log(`\n=== ${themeName} ===`);
  for (const r of rows) {
    const mark = r.pass ? 'PASS' : 'FAIL';
    console.log(
      `${mark}  ${r.ratio.toFixed(2).padStart(5)}:1  (>=${r.min})  ${r.label}  [${r.fg}=${vars.get(r.fg)} / ${r.bg}=${vars.get(r.bg)}]`,
    );
  }
  return failed;
}

const failedDark = run('深色 Cinematic Graphite', darkVars);
const failedLight = run('浅色 Silver Screen', lightVars);
const total = failedDark + failedLight;
console.log(`\n合计不达标：${total} 项`);
if (total > 0) process.exitCode = 1;
