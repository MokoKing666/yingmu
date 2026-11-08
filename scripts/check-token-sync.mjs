#!/usr/bin/env node
/**
 * Design Token 同步校验（TS ↔ CSS）。
 *
 * 背景：`packages/design-tokens/src/tokens.ts` 与 `tokens.css` 都声明了同一套数值，
 * 长期各自维护必然漂移（v0.3.1 审查就发现 accentDeep / accentWash / 语义色三处不一致）。
 * 本脚本做机器可读的一致性校验：
 *
 *   1. tokens.ts 里的颜色 / 阴影值必须与 tokens.css 的 CSS 变量逐项相等；
 *   2. 应用 CSS 里用到的每个 `var(--x)` 必须在 tokens.css 中定义
 *      （或在本文件内用 `--x:` 定义过），杜绝拼写错误与「幽灵变量」。
 *
 * 用法：node scripts/check-token-sync.mjs
 * 退出码：0 一致；1 存在漂移或未定义变量。
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const tsPath = resolve(ROOT, 'packages/design-tokens/src/tokens.ts');
const cssPath = resolve(ROOT, 'packages/design-tokens/src/tokens.css');

const ts = readFileSync(tsPath, 'utf8');
const css = readFileSync(cssPath, 'utf8');

function parseCssBlocks(source) {
  const lightMatch = /\n\[data-theme='light'\]\s*\{/.exec(source);
  const lightIdx = lightMatch ? lightMatch.index : source.length;
  const grab = (chunk) => {
    const vars = new Map();
    for (const m of chunk.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/gi)) {
      vars.set(m[1], m[2].trim());
    }
    return vars;
  };
  return { dark: grab(source.slice(0, lightIdx)), light: grab(source.slice(lightIdx)) };
}

const { dark: cssDark, light: cssLight } = parseCssBlocks(css);

/** 取 `key: { ... }` 的对象体（花括号配对，避免跨区块串读） */
function objectBody(source, key, fromIndex = 0) {
  const re = new RegExp(`${key}\\s*:\\s*\\{`);
  const m = re.exec(source.slice(fromIndex));
  if (!m) return '';
  const open = fromIndex + m.index + m[0].length - 1;
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(open + 1, i);
    }
  }
  return '';
}

function fieldsOf(body) {
  const map = new Map();
  for (const m of body.matchAll(/([A-Za-z0-9_]+)\s*:\s*('(?:[^'\\]|\\.)*'|"[^"]*"|[-\d.]+(?:\s*,)?)/g)) {
    map.set(m[1], m[2].replace(/^['"]|['"]$/g, '').replace(/,\s*$/, ''));
  }
  return map;
}

/** 取 `export const xxx = { ... }` 的对象体 */
function tsSection(startMarker) {
  const idx = ts.indexOf(startMarker);
  if (idx < 0) return new Map();
  const open = ts.indexOf('{', idx);
  if (open < 0) return new Map();
  let depth = 0;
  for (let i = open; i < ts.length; i += 1) {
    if (ts[i] === '{') depth += 1;
    else if (ts[i] === '}') {
      depth -= 1;
      if (depth === 0) return fieldsOf(ts.slice(open + 1, i));
    }
  }
  return new Map();
}

function tsNested(parentMarker, depthName) {
  const parentIdx = ts.indexOf(parentMarker);
  return fieldsOf(objectBody(ts, depthName, parentIdx));
}

/** 阴影等字符串值比较：忽略空白与小数尾随零的差异 */
const norm = (value) =>
  (value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/(\d+\.\d*?)0+\b/g, '$1')
    .replace(/\.(\s|$)/g, '$1');

let failures = 0;
const fail = (msg) => {
  console.error(`DRIFT  ${msg}`);
  failures += 1;
};

function compare(label, tsValue, cssValue) {
  if (cssValue === undefined) {
    fail(`${label}: tokens.css 里没有对应变量`);
    return;
  }
  if (norm(tsValue) !== norm(cssValue)) {
    fail(`${label}: tokens.ts=${tsValue} ≠ tokens.css=${cssValue}`);
    return;
  }
  console.log(`OK     ${label} = ${cssValue}`);
}

/* ------------------------------------------------------------------ */
/* 1. 颜色：深色主题（:root）                                           */
/* ------------------------------------------------------------------ */
const darkColor = tsSection('export const color = {');
const accentLight = tsSection('export const accentLight = {');

const DARK_KEYS = [
  ['accent', '--accent'],
  ['accentSoft', '--accent-soft'],
  ['accentDeep', '--accent-deep'],
  ['accentWash', '--accent-wash'],
  ['accentOn', '--accent-on'],
  ['silver', '--silver'],
];
for (const [k, v] of DARK_KEYS) compare(`color.${k} ↔ ${v} (dark)`, darkColor.get(k), cssDark.get(v));

const darkObj = tsNested('export const color = {', 'dark');
for (const [k, cssVar] of [
  ['bgBase', '--bg-base'],
  ['bgElevated', '--bg-elevated'],
  ['bgOverlay', '--bg-overlay'],
  ['surface', '--surface'],
  ['surfaceHover', '--surface-hover'],
  ['border', '--border'],
  ['borderStrong', '--border-strong'],
  ['borderControl', '--border-control'],
  ['textPrimary', '--text-primary'],
  ['textSecondary', '--text-secondary'],
  ['textTertiary', '--text-tertiary'],
]) {
  compare(`color.dark.${k} ↔ ${cssVar}`, darkObj.get(k), cssDark.get(cssVar));
}

/* ------------------------------------------------------------------ */
/* 2. 颜色：浅色主题（[data-theme='light']）                            */
/* ------------------------------------------------------------------ */
for (const [k, v] of [
  ['accent', '--accent'],
  ['accentSoft', '--accent-soft'],
  ['accentDeep', '--accent-deep'],
  ['accentWash', '--accent-wash'],
  ['accentOn', '--accent-on'],
  ['silver', '--silver'],
]) {
  compare(`accentLight.${k} ↔ ${v} (light)`, accentLight.get(k), cssLight.get(v));
}

const lightObj = tsNested('export const color = {', 'light');
for (const [k, cssVar] of [
  ['bgBase', '--bg-base'],
  ['bgElevated', '--bg-elevated'],
  ['surface', '--surface'],
  ['surfaceHover', '--surface-hover'],
  ['border', '--border'],
  ['borderStrong', '--border-strong'],
  ['borderControl', '--border-control'],
  ['textPrimary', '--text-primary'],
  ['textSecondary', '--text-secondary'],
  ['textTertiary', '--text-tertiary'],
]) {
  compare(`color.light.${k} ↔ ${cssVar}`, lightObj.get(k), cssLight.get(cssVar));
}

/* ------------------------------------------------------------------ */
/* 3. 语义色（深浅各一套）                                              */
/* ------------------------------------------------------------------ */
const semDark = tsNested('semantic: {', 'dark');
const semLight = tsNested('semantic: {', 'light');
for (const [k, cssVar] of [
  ['success', '--semantic-success'],
  ['warning', '--semantic-warning'],
  ['danger', '--semantic-danger'],
  ['favorite', '--semantic-favorite'],
  ['info', '--semantic-info'],
]) {
  compare(`semantic.dark.${k} ↔ ${cssVar}`, semDark.get(k), cssDark.get(cssVar));
  compare(`semantic.light.${k} ↔ ${cssVar}`, semLight.get(k), cssLight.get(cssVar));
}

/* ------------------------------------------------------------------ */
/* 4. 阴影                                                             */
/* ------------------------------------------------------------------ */
const shadowDark = tsNested('export const shadow = {', 'dark');
const shadowLight = tsNested('export const shadow = {', 'light');
for (const [k, cssVar] of [
  ['sm', '--shadow-sm'],
  ['md', '--shadow-md'],
  ['lg', '--shadow-lg'],
  ['glow', '--shadow-glow'],
]) {
  compare(`shadow.dark.${k} ↔ ${cssVar}`, shadowDark.get(k), cssDark.get(cssVar));
  compare(`shadow.light.${k} ↔ ${cssVar}`, shadowLight.get(k), cssLight.get(cssVar));
}

/* ------------------------------------------------------------------ */
/* 5. 应用 CSS 中引用的每个 var(--x) 都必须有定义                        */
/* ------------------------------------------------------------------ */
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (name.endsWith('.css')) out.push(full);
  }
  return out;
}

const appCssFiles = walk(resolve(ROOT, 'apps/desktop/src'));
const definedInCss = new Set([...cssDark.keys(), ...cssLight.keys()]);
for (const file of appCssFiles) {
  const code = readFileSync(file, 'utf8');
  // 本文件内自定义的局部变量也算定义
  for (const m of code.matchAll(/(--[a-z0-9-]+)\s*:/gi)) definedInCss.add(m[1]);
  for (const m of code.matchAll(/var\((--[a-z0-9-]+)/gi)) {
    const name = m[1];
    if (!definedInCss.has(name)) {
      fail(`${relative(ROOT, file)}: var(${name}) 未在 tokens.css 中定义`);
    }
  }
}

console.log(`\n检查完成：${failures === 0 ? 'TS 与 CSS 完全一致，无漂移' : `${failures} 处不一致`}`);
if (failures > 0) process.exitCode = 1;
