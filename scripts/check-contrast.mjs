#!/usr/bin/env node
/**
 * WCAG 2.2 对比度实测（覆盖真实组件配对）。
 *
 * 数据源：packages/design-tokens/src/tokens.css（纯文本，直接解析 CSS 变量），
 * 因此检查的就是浏览器实际拿到的值，而不是 TS 里另抄一份。
 *
 * 阈值（任务书 9.1）：
 *   - 普通文字                4.5:1（AA）
 *   - 大文本（>=18.66px 粗体或 >=24px） 3:1
 *   - 功能性图标 / 控件边界 / 焦点指示  3:1（AA 非文本 1.4.11）
 *   - 纯装饰性边框            不作要求（这里给 1.2 的「可见性」下限，并明确标注为装饰）
 *
 * 透明遮罩与渐变的处理假设（任务书 9.2）：
 *   不把不透明颜色的对比度直接当成叠加后的结果。凡是压在图片/视频上的文字，
 *   都按「最不利画面 + 最强遮罩」合成后再算：
 *     effectiveBg = alpha * scrimColor + (1 - alpha) * worstCaseArtwork
 *   其中 worstCaseArtwork 取画面高光区（深色主题假设 #8A9299，浅色主题假设 #FFFFFF），
 *   因为高光区上的白字最危险；渐变取「离文字最近且遮罩最弱」的一端。
 *   磁贴底部文字用 .tile-scrim 的最强端（0.88–0.9 黑）合成。
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

/** 支持 #rgb / #rrggbb / rgba(r,g,b,a) / rgb(r,g,b) */
function toRgb(value) {
  const v = value.trim();
  const hex = /^#([0-9a-f]{6})$/i.exec(v);
  if (hex) {
    const n = parseInt(hex[1], 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: 1 };
  }
  const short = /^#([0-9a-f]{3})$/i.exec(v);
  if (short) {
    const s = short[1];
    return {
      r: parseInt(s[0] + s[0], 16),
      g: parseInt(s[1] + s[1], 16),
      b: parseInt(s[2] + s[2], 16),
      a: 1,
    };
  }
  const rgba = /^rgba?\(([^)]+)\)$/i.exec(v);
  if (rgba) {
    const parts = rgba[1].split(',').map((p) => p.trim());
    return {
      r: Number(parts[0]),
      g: Number(parts[1]),
      b: Number(parts[2]),
      a: parts[3] === undefined ? 1 : Number(parts[3]),
    };
  }
  return null;
}

/** 半透明前景压在背景上的合成色 */
function composite(fg, bg) {
  const a = fg.a;
  return {
    r: a * fg.r + (1 - a) * bg.r,
    g: a * fg.g + (1 - a) * bg.g,
    b: a * fg.b + (1 - a) * bg.b,
    a: 1,
  };
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

/**
 * 配对条目：
 *   [前景, 背景, 阈值, 说明, 类型]
 * 前景/背景可以是：
 *   - 变量名（--text-primary）
 *   - 字面颜色（#ffffff / rgba(...)）
 *   - 合成表达式 `over(<前景>, <遮罩>, <底色>)`
 * 类型：text（4.5/3.0）| nontext（3.0）| decorative（仅可见性）
 */
const PAIRS = [
  // —— 正文 / 面板 / 输入 ——
  ['--text-primary', '--bg-base', 4.5, '主文字 / 页面背景', 'text'],
  ['--text-primary', '--surface', 4.5, '主文字 / 普通表面（含搜索输入框）', 'text'],
  ['--text-primary', '--surface-hover', 4.5, '主文字 / 悬停表面', 'text'],
  ['--text-primary', '--bg-elevated', 4.5, '主文字 / 浮层', 'text'],
  ['--text-secondary', '--bg-base', 4.5, '次级文字 / 页面背景', 'text'],
  ['--text-secondary', '--surface', 4.5, '次级文字 / 普通表面', 'text'],
  ['--text-tertiary', '--bg-base', 4.5, '辅助文字 / 页面背景', 'text'],
  ['--text-tertiary', '--surface', 4.5, '搜索 placeholder / 辅助文字', 'text'],
  ['--text-tertiary', '--bg-elevated', 4.5, '辅助文字 / 浮层', 'text'],

  // —— 强调色与按钮 ——
  ['--accent', '--bg-base', 4.5, '强调色文字 / 页面背景', 'text'],
  ['--accent', '--surface', 4.5, '强调色文字 / 普通表面', 'text'],
  ['--accent-on', '--accent', 4.5, '主要按钮文字 / 强调色底', 'text'],
  ['--accent', '--surface', 3, '选中态指示（导航选中 / tag-accent）', 'nontext'],
  ['--accent', '--bg-base', 3, '焦点环 / 选中指示', 'nontext'],

  // —— 语义色 ——
  ['--semantic-success', '--bg-base', 4.5, '成功色文字 / 页面背景', 'text'],
  ['--semantic-success', '--bg-elevated', 4.5, '成功徽标文字 / 浮层', 'text'],
  ['--semantic-warning', '--bg-base', 4.5, '警告色文字 / 页面背景', 'text'],
  ['--semantic-warning', '--bg-elevated', 4.5, '警告徽标文字 / 浮层', 'text'],
  ['--semantic-danger', '--bg-base', 4.5, '危险色文字 / 页面背景', 'text'],
  ['--semantic-danger', '--bg-elevated', 4.5, '错误提示文字 / 浮层', 'text'],
  ['--semantic-favorite', '--bg-base', 4.5, '收藏色文字 / 页面背景', 'text'],
  ['--semantic-favorite', '--surface', 3, '收藏图标 / 普通表面', 'nontext'],
  ['--semantic-info', '--bg-base', 4.5, '信息色文字 / 页面背景', 'text'],
  ['--semantic-info', '--bg-elevated', 4.5, '信息提示文字 / 浮层', 'text'],

  // —— 禁用 / 失效控件（用 tertiary，允许 3:1 的大文本级对比即可读） ——
  ['--text-tertiary', '--surface', 3, '禁用按钮文字（视觉弱化，需仍可辨识）', 'nontext'],

  // —— 边框：功能性 vs 装饰性分开 ——
  ['--border-control', '--bg-base', 3, '功能性控件边界（输入框/按钮/分段控件）', 'nontext'],
  ['--border-strong', '--bg-base', 1.5, '强调边框（弹层/Toast 外框，非唯一识别依据）', 'decorative'],
  ['--border', '--bg-base', 1.2, '装饰性分隔线（仅需可见，不作功能边界）', 'decorative'],

  // —— 进度条：填充 vs 轨道 ——
  ['--accent', '--bg-base', 3, '进度条填充 / 轨道', 'nontext'],

  // —— 压在图片上的文字（合成后再算，见文件头假设） ——
  ['--silver', 'over(SCRIM, ARTWORK)', 4.5, '磁贴标题 / 封面高光区 + scrim 最强端', 'text'],
  ['--silver', 'over(PLAYER_SCRIM, ARTWORK)', 4.5, '播放器控制文字 / 视频高光区 + 玻璃遮罩', 'text'],
  ['--silver', 'over(SCRIM, ARTWORK)', 3, '磁贴徽标图标 / 封面 + scrim', 'nontext'],
];

/** 画面高光区的最不利假设色（见文件头） */
function artworkWorstCase(theme) {
  return theme === 'light' ? { r: 255, g: 255, b: 255, a: 1 } : { r: 138, g: 146, b: 153, a: 1 };
}

function resolveColor(expr, vars, theme) {
  const trimmed = expr.trim();
  if (trimmed === 'ARTWORK') return artworkWorstCase(theme);
  // 主题相关遮罩：与 styles/wall.css、styles/player.css 的实际值一致
  if (trimmed === 'SCRIM') return toRgb(theme === 'light' ? 'rgba(12,14,18,0.88)' : 'rgba(6,8,10,0.9)');
  if (trimmed === 'PLAYER_SCRIM') return toRgb('rgba(6,8,10,0.72)');
  // over(<遮罩>, <底色>)：返回遮罩压在底色上的**合成背景色**
  const over = /^over\((.+)\)$/.exec(trimmed);
  if (over) {
    const parts = splitArgs(over[1]);
    const mask = resolveColor(parts[0], vars, theme);
    const bg = resolveColor(parts[1], vars, theme);
    return composite(mask, bg);
  }
  if (trimmed.startsWith('--')) return toRgb(vars.get(trimmed) ?? '');
  return toRgb(trimmed);
}

function splitArgs(s) {
  const out = [];
  let depth = 0;
  let cur = '';
  for (const ch of s) {
    if (ch === '(') depth += 1;
    if (ch === ')') depth -= 1;
    if (ch === ',' && depth === 0) {
      out.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

function run(themeName, theme, vars) {
  let failed = 0;
  console.log(`\n=== ${themeName} ===`);
  for (const [fgExpr, bgExpr, min, label, kind] of PAIRS) {
    const f = resolveColor(fgExpr, vars, theme);
    const b = resolveColor(bgExpr, vars, theme);
    if (!f || !b) {
      console.log(`FAIL   ??:1  (>=${min})  ${label}  [无法解析 ${fgExpr} / ${bgExpr}]`);
      failed += 1;
      continue;
    }
    const ratio = contrast(f, b);
    const pass = ratio >= min;
    if (!pass) failed += 1;
    const kindTag = kind === 'text' ? '文字' : kind === 'nontext' ? '非文本' : '装饰';
    console.log(
      `${pass ? 'PASS' : 'FAIL'}  ${ratio.toFixed(2).padStart(5)}:1  (>=${min})  [${kindTag}] ${label}`,
    );
  }
  return failed;
}

const failedDark = run('深色 Cinematic Graphite', 'dark', darkVars);
const failedLight = run('浅色 Silver Screen', 'light', lightVars);
const total = failedDark + failedLight;
console.log(`\n合计不达标：${total} 项`);
if (total > 0) process.exitCode = 1;
