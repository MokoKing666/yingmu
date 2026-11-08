#!/usr/bin/env node
/**
 * 影幕 YingMu — 原创演示封面素材生成器（零第三方依赖、可重复执行）
 *
 * 生成 48 张彼此明显不同的「电影 / 摄影场景插画」SVG 到
 *   apps/desktop/public/artwork/ym-NN-<比例>-<分类>.svg
 *
 * 设计要点：
 *  - 全部为程序化矢量场景：天空渐变、主体剪影、中景、前景、光源、
 *    大气透视（远层低对比）、体积光束、颗粒与暗角；不是圆环 / 条纹 / Logo 几何。
 *  - 8 个「比例 + 分类」家族覆盖 2:3 / 16:9 / 4:3 / 1:1 / 5:4 / 4:5 / 3:2，
 *    每个家族内部用不同题材 + 不同调色 + 不同随机种子，确保肉眼可辨。
 *  - 每张独立调色（在基础色板上做确定性的 HSL 微调），低饱和电影感，
 *    刻意避开紫粉廉价渐变。
 *  - 确定性：固定种子 PRNG，无 Math.random / Date / 外部输入；
 *    相同输入 → 完全相同的文件字节。
 *  - 不含任何第三方版权图片、外部 URL 或本机绝对路径。
 *
 * 用法：node scripts/generate-demo-artwork.mjs
 */

import { writeFileSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'apps', 'desktop', 'public', 'artwork');

/* ------------------------------------------------------------------ */
/* 基础工具                                                            */
/* ------------------------------------------------------------------ */

const R = (n) => Math.round(n * 10) / 10;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const pad2 = (n) => String(n).padStart(2, '0');

/** 确定性 PRNG（mulberry32），相同种子得到相同序列 */
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* RGB <-> HSL，用于每张素材的独立调色 */
function hex2rgb(hex) {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
function rgb2hex(r, g, b) {
  const f = (x) => clamp(Math.round(x), 0, 255).toString(16).padStart(2, '0');
  return `#${f(r)}${f(g)}${f(b)}`;
}
function rgb2hsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0, s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
  }
  return [h * 360, s, l];
}
function hsl2rgb(h, s, l) {
  h = ((h % 360) + 360) % 360 / 360;
  const f = (p, q, t) => {
    t = ((t % 1) + 1) % 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  if (s === 0) return [l * 255, l * 255, l * 255];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [f(p, q, h + 1 / 3) * 255, f(p, q, h) * 255, f(p, q, h - 1 / 3) * 255];
}
function hslShift(hex, dh, ds, dl) {
  const [h, s, l] = rgb2hsl(...hex2rgb(hex));
  return rgb2hex(...hsl2rgb(h + dh, clamp(s + ds, 0, 1), clamp(l + dl, 0, 1)));
}

/** 16 组低饱和电影感基础色板；[天空顶, 天空底, 深色, 光源, 高光, 墨黑, 暖光] */
const PALETTES = [
  ['#0c2026', '#1d4249', '#07141a', '#3f8f8b', '#a7d2ca', '#04100f', '#c9a877'], // 冷青夜
  ['#241812', '#5a3a22', '#150c07', '#d99a44', '#e7c58a', '#0f0805', '#efb455'], // 琥珀黄昏
  ['#101a2b', '#27406b', '#080e1a', '#5a83b8', '#a9c4e2', '#050912', '#d7b48a'], // 钢蓝夜
  ['#121f18', '#2c4a35', '#080f0b', '#5c8a58', '#a9c99c', '#050b07', '#c8b07a'], // 森林绿
  // v0.3：原来这一格是「沙漠赭」（#7a5a2c 一片琥珀），与 Cinematic Neutral 的冷调
  // 品牌冲突。改成高原寒蓝，保留石质建筑的暖灰高光，整体温度回到冷侧。
  ['#141c22', '#33465a', '#0a1016', '#5f8fb0', '#b8d4e4', '#050a0e', '#c9b79a'], // 高原寒蓝
  ['#081826', '#123a52', '#04101c', '#2f7fa6', '#8fc4d6', '#030c14', '#b9d0d8'], // 深海蓝
  ['#1b242b', '#46545e', '#0c1216', '#9fb2bd', '#d3dde2', '#070c0f', '#c2b49a'], // 雪原灰蓝
  // v0.3：原来这一格是「钨丝室内」（#6b4a30 暖棕），改成冷白室内——
  // 室内场景本来就该是冷白灯管与窗光，暖黄会整片发浑。
  ['#171c22', '#3d4956', '#0b0f14', '#7f99ad', '#d2e2ec', '#05080a', '#c8bda8'], // 冷白室内
  ['#161719', '#3a3c40', '#0b0c0d', '#8a8c90', '#c7c9cc', '#050506', '#b6a68a'], // 黑白 noir
  ['#2a1a16', '#6a3a30', '#160c0a', '#c06a4c', '#e0a68c', '#0d0706', '#d89a6a'], // 陶土
  ['#0e1424', '#233056', '#070b16', '#4a6bb0', '#9fb4df', '#04060e', '#c2b49a'], // 暮蓝
  ['#221c12', '#5a4a28', '#120e08', '#c9ac5e', '#e6d29a', '#0b0805', '#e8c87a'], // 纪录片 sepia
  ['#0d1a1c', '#1f4a4a', '#061012', '#3aa39a', '#a8e0d8', '#04100f', '#d8c08a'], // 青绿夜
  // v0.3：原来这一格是「暖棕」（#5c4a2c），改成雾蓝——它出现的次数最多，
  // 一片暖棕会把整面墙拉回暖色。
  ['#111a20', '#2b464a', '#070f11', '#4f8f93', '#b7dcda', '#040a09', '#c9bda6'], // 雾蓝
  ['#151b14', '#384a2c', '#0a0d08', '#8aa858', '#c4d89a', '#050704', '#d2c08a'], // 苔原
  ['#1a1c22', '#33384a', '#0a0c11', '#6a76a0', '#b4bedd', '#05070b', '#c6b89a'], // 阴天蓝灰
];

/** 在基础色板上做确定性微调，保证 48 张各自独立调色 */
function grade(base, i) {
  const dh = (((i * 37) % 13) - 6) * 1.15;
  const ds = (((i * 17) % 9) - 4) * 0.014;
  const dl = (((i * 23) % 7) - 3) * 0.013;
  const [top, mid, deep, glow, accent, ink, warm] = base.map((hx) => hslShift(hx, dh, ds, dl));
  return { top, mid, deep, glow, accent, ink, warm };
}

/** 比例 → 像素尺寸（viewBox），与 demoArtworkAspect 的 n/d 完全一致 */
const RATIO_DIMS = {
  '2x3': [600, 900],
  '16x9': [1280, 720],
  '4x3': [800, 600],
  '1x1': [720, 720],
  '5x4': [750, 600],
  '4x5': [640, 800],
  '3x2': [900, 600],
};

/* ------------------------------------------------------------------ */
/* SVG 元素原语                                                        */
/* ------------------------------------------------------------------ */

const rectP = (x, y, w, h, fill, op, extra = '') =>
  `<rect x="${R(x)}" y="${R(y)}" width="${R(w)}" height="${R(h)}" fill="${fill}"${op != null ? ` opacity="${R(op)}"` : ''}${extra}/>`;
const circ = (cx, cy, r, fill, op, extra = '') =>
  `<circle cx="${R(cx)}" cy="${R(cy)}" r="${R(r)}" fill="${fill}"${op != null ? ` opacity="${R(op)}"` : ''}${extra}/>`;
const ell = (cx, cy, rx, ry, fill, op, extra = '') =>
  `<ellipse cx="${R(cx)}" cy="${R(cy)}" rx="${R(rx)}" ry="${R(ry)}" fill="${fill}"${op != null ? ` opacity="${R(op)}"` : ''}${extra}/>`;
const pth = (d, fill, op, extra = '') =>
  `<path d="${d}" fill="${fill}"${op != null ? ` opacity="${R(op)}"` : ''}${extra}/>`;
const ln = (x1, y1, x2, y2, stroke, sw, op) =>
  `<line x1="${R(x1)}" y1="${R(y1)}" x2="${R(x2)}" y2="${R(y2)}" stroke="${stroke}" stroke-width="${R(sw)}"${op != null ? ` opacity="${R(op)}"` : ''}/>`;
function poly(pts, fill, op, extra = '') {
  const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${R(x)},${R(y)}`).join(' ') + ' Z';
  return pth(d, fill, op, extra);
}

/** 太阳 / 月亮 + 柔光光晕 */
function disc(c, mood) {
  const rad = Math.min(c.W, c.H) * 0.055;
  const col = mood === 'night' ? c.p.accent : c.p.warm;
  return circ(c.lx, c.ly, rad * 2.1, c.p.glow, 0.4, ' filter="url(#softLg)"')
    + circ(c.lx, c.ly, rad, col, 0.92);
}

/** 山脊 / 沙丘 / 丘陵：多层大气透视，可加雪顶 */
function ridge(c, o) {
  const r = c.rand;
  const seg = c.W / o.peaks;
  const caps = [];
  let d = `M0,${R(c.H)} L0,${R(o.baseY)}`;
  for (let k = 0; k < o.peaks; k++) {
    const px = seg * (k + 0.5) + (r() - 0.5) * seg * 0.45;
    const py = o.baseY - o.amp * (0.45 + r() * 0.8);
    caps.push([px, py]);
    d += ` L${R(seg * k)},${R(o.baseY - o.amp * 0.08)} L${R(px)},${R(py)} L${R(seg * (k + 1))},${R(o.baseY - o.amp * 0.1)}`;
  }
  d += ` L${R(c.W)},${R(o.baseY)} L${R(c.W)},${R(c.H)} Z`;
  let s = pth(d, o.fill, o.op);
  if (o.snow) {
    for (const [px, py] of caps) {
      const w = o.amp * 0.13;
      s += poly([[px, py], [px - w, py + o.amp * 0.2], [px + w, py + o.amp * 0.2]], c.p.accent, 0.7);
    }
  }
  return s;
}

/** 城市天际线：不同高度楼宇 + 零星亮窗 */
function skyline(c, o) {
  const r = c.rand;
  let s = '';
  const bw = c.W / o.count;
  for (let i = 0; i < o.count; i++) {
    const bh = c.H * (o.minH + r() * (o.maxH - o.minH));
    const bx = i * bw + (r() - 0.5) * bw * 0.1;
    const by = c.hz - bh;
    s += rectP(bx, by, bw * 0.88, bh, o.col, o.op);
    if (o.windows && r() > 0.22) {
      const rows = Math.max(1, Math.floor(bh / (c.H * 0.036)));
      for (let rr = 0; rr < rows; rr++) {
        for (let cc = 0; cc < 3; cc++) {
          if (r() > 0.52) {
            s += rectP(bx + bw * 0.16 + cc * bw * 0.22, by + rr * c.H * 0.036 + c.H * 0.012,
              bw * 0.075, c.H * 0.013, c.p.warm, 0.5 + r() * 0.4);
          }
        }
      }
    }
  }
  return s;
}

/** 松树 / 杉树剪影 */
function pine(c, x, baseY, h, col, op) {
  let s = rectP(x - h * 0.028, baseY - h * 0.14, h * 0.056, h * 0.2, col, op);
  for (let i = 0; i < 4; i++) {
    const ty = baseY - h * (0.2 + i * 0.19);
    const w = h * (0.32 - i * 0.055);
    s += poly([[x, ty - h * 0.28], [x - w, ty + h * 0.07], [x + w, ty + h * 0.07]], col, op);
  }
  return s;
}

/** 体积光束（光源向下发散） */
function beams(c, o) {
  const r = c.rand;
  let s = '';
  const n = o.n ?? 5;
  for (let i = 0; i < n; i++) {
    const tx = c.lx + (r() - 0.5) * c.W * 0.14;
    const w1 = c.W * (0.02 + r() * 0.04);
    const w2 = c.W * (0.1 + r() * 0.16);
    s += poly([[tx, c.ly], [tx - w1, c.H], [tx - w1 - w2, c.H]], c.p.glow, 0.05 + r() * 0.07);
    s += poly([[tx, c.ly], [tx + w1, c.H], [tx + w1 + w2, c.H]], c.p.glow, 0.04 + r() * 0.06);
  }
  return s;
}

/** 水面反光横带 */
function reflection(c, o) {
  const r = c.rand;
  let s = '';
  const bands = o.bands ?? 10;
  for (let i = 0; i < bands; i++) {
    const y = c.hz + ((i + 0.5) / bands) * (c.H - c.hz);
    const w = c.W * (0.08 + r() * 0.5);
    const x = c.lx - w / 2 + (r() - 0.5) * c.W * 0.16;
    s += rectP(x, y, w, Math.max(1.2, c.H * 0.006), c.p.glow, 0.07 + r() * 0.13);
  }
  return s;
}

/** 简笔人物剪影（头 + 身） */
function figure(c, x, y, s, col, op) {
  const h = Math.min(c.W, c.H) * 0.14 * s;
  return circ(x, y - h * 0.86, h * 0.105, col, op)
    + pth(`M${R(x - h * 0.075)},${R(y - h * 0.76)} Q${R(x)},${R(y - h * 0.82)} ${R(x + h * 0.075)},${R(y - h * 0.76)} L${R(x + h * 0.12)},${R(y - h * 0.34)} L${R(x + h * 0.055)},${R(y)} L${R(x - h * 0.055)},${R(y)} L${R(x - h * 0.12)},${R(y - h * 0.34)} Z`, col, op);
}

/** 大气 / 天气颗粒（一种场景只选一种，避免杂乱） */
function particles(c) {
  const r = c.rand;
  const kind = c.particles;
  const n = kind === 'stars' ? 64 : kind === 'rain' ? 44 : kind === 'snow' ? 38
    : kind === 'dust' ? 24 : kind === 'bubbles' ? 20 : kind === 'leaves' ? 16 : 0;
  let s = '';
  for (let i = 0; i < n; i++) {
    const x = r() * c.W;
    const y = r() * c.H;
    if (kind === 'stars') s += circ(x, y, 0.5 + r() * 1.5, c.p.accent, 0.3 + r() * 0.6);
    else if (kind === 'rain') s += ln(x, y, x - c.W * 0.012, y + c.H * 0.055, c.p.accent, 0.9, 0.1 + r() * 0.18);
    else if (kind === 'snow') s += circ(x, y, 0.9 + r() * 2.3, '#eef3f1', 0.25 + r() * 0.5);
    else if (kind === 'dust') s += circ(x, y, 0.7 + r() * 1.5, c.p.warm, 0.1 + r() * 0.25);
    else if (kind === 'bubbles') s += circ(x, y, 1.2 + r() * 3, c.p.accent, 0.14 + r() * 0.3);
    else if (kind === 'leaves') s += ell(x, y, 2 + r() * 3.5, 1 + r() * 2, c.p.accent, 0.2 + r() * 0.32);
  }
  return s;
}

/* ------------------------------------------------------------------ */
/* 构图函数（每个组合前景 / 中景 / 背景 / 光影）                          */
/* ------------------------------------------------------------------ */

const BUILDERS = {
  /** 雪山脊线 / 高原 / 田野远山 */
  mountains(c) {
    let s = disc(c, c.mood);
    s += ridge(c, { baseY: c.hz - c.H * 0.11, amp: c.H * 0.12, peaks: 6, fill: c.p.mid, op: 0.45 });
    s += ridge(c, { baseY: c.hz - c.H * 0.04, amp: c.H * 0.18, peaks: 5, fill: c.p.glow, op: 0.32 });
    s += ridge(c, { baseY: c.hz + c.H * 0.03, amp: c.H * 0.29, peaks: 5, fill: c.p.mid, op: 0.95, snow: c.variant !== 2 });
    s += ridge(c, { baseY: c.hz + c.H * 0.15, amp: c.H * 0.17, peaks: 7, fill: c.p.deep, op: 0.98 });
    s += rectP(0, c.hz + c.H * 0.22, c.W, c.H * 0.2, c.p.deep, 0.9);
    if (c.variant === 2) { // 田野远山：前景加几道田埂
      for (let i = 0; i < 4; i++) s += ln(0, c.hz + c.H * (0.28 + i * 0.06), c.W, c.hz + c.H * (0.26 + i * 0.06), c.p.accent, 1.4, 0.18);
    }
    s += particles(c);
    return s;
  },

  /** 城市天际线剪影 / 雨夜霓虹 / 黄昏操场 */
  city(c) {
    const r = c.rand;
    let s = disc(c, 'night');
    s += skyline(c, { count: 11, minH: 0.07, maxH: 0.2, col: c.p.mid, op: 0.4, windows: false });
    s += skyline(c, { count: 15, minH: 0.1, maxH: 0.34, col: c.p.deep, op: 0.95, windows: true });
    s += rectP(0, c.hz, c.W, c.H - c.hz, c.p.deep, 0.96);
    if (c.variant === 1) { // 霓虹招牌 + 湿地反光
      const signs = ['#c8743a', '#3a86a0', '#b0603f', '#4a8f7a', '#a5523c'];
      for (let i = 0; i < 9; i++) {
        const x = r() * c.W * 0.9;
        const y = c.hz - c.H * (0.08 + r() * 0.22);
        s += rectP(x, y, c.W * (0.015 + r() * 0.035), c.H * (0.02 + r() * 0.05), signs[i % signs.length], 0.55 + r() * 0.35);
      }
      s += reflection(c, { bands: 12 });
      s += rectP(c.W * 0.6, c.hz + c.H * 0.06, c.W * 0.32, c.H * 0.5, c.p.glow, 0.06);
      s += figure(c, c.W * 0.34, c.H * 0.93, 1, c.p.ink, 0.85); // 撑伞行人
      s += ell(c.W * 0.34, c.H * 0.79, c.W * 0.055, c.W * 0.018, c.p.deep, 0.9); // 伞面
    }
    if (c.variant === 2) { // 黄昏操场：地平线 + 单杠 + 远处球门
      s += rectP(0, c.hz, c.W, c.H - c.hz, c.p.mid, 0.5);
      s += ln(c.W * 0.12, c.H * 0.82, c.W * 0.4, c.H * 0.82, c.p.deep, 3, 0.8);
      s += ln(c.W * 0.12, c.H * 0.82, c.W * 0.12, c.H * 0.68, c.p.deep, 3, 0.8);
      s += ln(c.W * 0.4, c.H * 0.82, c.W * 0.4, c.H * 0.68, c.p.deep, 3, 0.8);
      s += rectP(c.W * 0.66, c.H * 0.74, c.W * 0.18, c.H * 0.09, c.p.deep, 0.7);
    }
    s += particles(c);
    return s;
  },

  /** 雾港灯塔 / 暴风海岸 */
  harbour(c) {
    const r = c.rand;
    let s = '';
    if (c.variant === 1) { // 暴风：深云 + 灯塔在崖上
      s += rectP(0, 0, c.W, c.hz * 0.7, c.p.deep, 0.5);
      for (let i = 0; i < 5; i++) s += ell(r() * c.W, c.H * (0.1 + r() * 0.25), c.W * (0.2 + r() * 0.25), c.H * 0.05, c.p.mid, 0.4);
    } else {
      s += disc(c, 'night');
    }
    // 水面
    s += rectP(0, c.hz, c.W, c.H - c.hz, c.p.deep, 0.9);
    s += reflection(c, { bands: 12 });
    // 礁石 / 崖壁前景
    s += poly([[0, c.H], [0, c.hz + c.H * 0.12], [c.W * 0.18, c.hz + c.H * 0.04], [c.W * 0.3, c.H]], c.p.ink, 0.95);
    // 灯塔
    const tx = c.W * (c.variant === 1 ? 0.24 : 0.68), ty = c.hz + c.H * 0.05;
    s += poly([[tx - c.W * 0.022, ty], [tx + c.W * 0.022, ty], [tx + c.W * 0.014, ty - c.H * 0.3], [tx - c.W * 0.014, ty - c.H * 0.3]], c.p.deep, 0.98);
    s += rectP(tx - c.W * 0.026, ty - c.H * 0.32, c.W * 0.052, c.H * 0.035, c.p.deep, 1);
    s += circ(tx, ty - c.H * 0.305, c.W * 0.012, c.p.warm, 0.95);
    // 灯束
    s += poly([[tx, ty - c.H * 0.3], [tx - c.W * 0.5, ty - c.H * 0.5], [tx - c.W * 0.5, ty - c.H * 0.16]], c.p.glow, 0.12);
    // 小船
    if (c.variant !== 1) {
      const bx = c.W * 0.3, by = c.hz + c.H * 0.16;
      s += poly([[bx - c.W * 0.05, by], [bx + c.W * 0.05, by], [bx + c.W * 0.035, by + c.H * 0.02], [bx - c.W * 0.035, by + c.H * 0.02]], c.p.ink, 0.9);
      s += ln(bx, by, bx, by - c.H * 0.09, c.p.ink, 1.6, 0.9);
    } else { // 暴风巨浪
      for (let i = 0; i < 4; i++) {
        const wy = c.hz + c.H * (0.1 + i * 0.09);
        s += pth(`M0,${R(wy)} Q${R(c.W * 0.25)},${R(wy - c.H * 0.05)} ${R(c.W * 0.5)},${R(wy)} T${R(c.W)},${R(wy)}`, 'none', null, ` stroke="${c.p.accent}" stroke-width="${R(c.H * 0.012)}" opacity="${R(0.15 + r() * 0.2)}"`);
      }
    }
    s += particles(c);
    return s;
  },

  /** 沙漠日落 */
  desert(c) {
    const r = c.rand;
    let s = disc(c, 'day');
    // 平滑沙丘（用二次曲线叠层）
    for (let l = 0; l < 3; l++) {
      const y = c.hz - c.H * (0.02 + l * 0.07);
      const amp = c.H * (0.05 + l * 0.02);
      s += pth(`M0,${R(c.H)} L0,${R(y)} Q${R(c.W * 0.3)},${R(y - amp)} ${R(c.W * 0.55)},${R(y)} T${R(c.W)},${R(y + amp * 0.4)} L${R(c.W)},${R(c.H)} Z`,
        l === 0 ? c.p.mid : l === 1 ? c.p.glow : c.p.deep, 0.55 + l * 0.2);
    }
    s += rectP(0, c.hz + c.H * 0.16, c.W, c.H * 0.3, c.p.deep, 0.9);
    // 远处驼队剪影
    const cy = c.hz + c.H * 0.14;
    for (let i = 0; i < 3; i++) {
      const x = c.W * (0.62 + i * 0.06);
      s += ell(x, cy - c.H * 0.012, c.W * 0.012, c.H * 0.012, c.p.ink, 0.9);
      s += ell(x, cy - c.H * 0.026, c.W * 0.008, c.H * 0.012, c.p.ink, 0.9);
      s += figure(c, x + c.W * 0.004, cy - c.H * 0.03, 0.35, c.p.ink, 0.9);
    }
    // 前景风纹
    for (let i = 0; i < 5; i++) s += ln(0, c.hz + c.H * (0.26 + i * 0.05), c.W, c.hz + c.H * (0.24 + i * 0.05), c.p.warm, 1.2, 0.1 + r() * 0.1);
    s += particles(c);
    return s;
  },

  /** 深海沉船 / 水下光束 */
  shipwreck(c) {
    const r = c.rand;
    let s = '';
    // 顶部透光
    s += ell(c.W * 0.5, -c.H * 0.05, c.W * 0.7, c.H * 0.35, c.p.glow, 0.18, ' filter="url(#softLg)"');
    s += beams(c, { n: 6 });
    if (c.variant === 1) {
      // 纯水下光束 + 潜水员
      s += figure(c, c.W * 0.62, c.H * 0.6, 1.1, c.p.ink, 0.55);
      s += circ(c.W * 0.62, c.H * 0.46, c.W * 0.02, c.p.deep, 0.7);
    } else {
      // 沉船船体
      const hx = c.W * 0.3, hy = c.H * 0.62;
      s += pth(`M${R(hx)},${R(hy)} Q${R(hx + c.W * 0.2)},${R(hy + c.H * 0.14)} ${R(hx + c.W * 0.46)},${R(hy)} L${R(hx + c.W * 0.42)},${R(hy - c.H * 0.03)} L${R(hx + c.W * 0.04)},${R(hy - c.H * 0.03)} Z`, c.p.deep, 0.95);
      s += ln(hx + c.W * 0.24, hy - c.H * 0.03, hx + c.W * 0.24, hy - c.H * 0.28, c.p.deep, 4, 0.9); // 桅杆
      s += poly([[hx + c.W * 0.24, hy - c.H * 0.26], [hx + c.W * 0.38, hy - c.H * 0.12], [hx + c.W * 0.24, hy - c.H * 0.12]], c.p.mid, 0.5); // 破帆
      s += pth(`M0,${R(c.H)} Q${R(c.W * 0.3)},${R(hy + c.H * 0.2)} ${R(c.W)},${R(hy + c.H * 0.16)} L${R(c.W)},${R(c.H)} Z`, c.p.ink, 0.9); // 海床
    }
    // 沉泥颗粒由 bubbles / dust 承担
    s += particles(c);
    return s;
  },

  /** 森林晨雾 / 竹影庭院 / 温室植物 */
  forest(c) {
    const r = c.rand;
    let s = '';
    if (c.variant === 1) { // 竹影庭院：粉墙 + 月 + 竹影
      s += rectP(0, c.hz - c.H * 0.1, c.W, c.H * 0.7, c.p.mid, 0.5);
      s += circ(c.lx, c.ly, Math.min(c.W, c.H) * 0.09, c.p.accent, 0.5, ' filter="url(#soft)"');
      s += circ(c.lx, c.ly, Math.min(c.W, c.H) * 0.055, c.p.accent, 0.85);
      for (let i = 0; i < 9; i++) {
        const x = (i + 0.5) * c.W / 9 + (r() - 0.5) * c.W * 0.03;
        s += ln(x, c.H, x - c.W * 0.02, c.hz - c.H * 0.2, c.p.deep, c.W * 0.006, 0.55);
        for (let j = 0; j < 5; j++) {
          const ly = c.hz - c.H * 0.18 + j * c.H * 0.12;
          s += ell(x - c.W * 0.02 - (r() - 0.5) * c.W * 0.05, ly, c.W * 0.03, c.H * 0.008, c.p.deep, 0.4);
        }
      }
      return s + particles(c);
    }
    if (c.variant === 2) { // 温室：拱形玻璃 + 植物
      s += pth(`M0,${R(c.H)} L0,${R(c.hz)} Q${R(c.W * 0.5)},${R(-c.H * 0.15)} ${R(c.W)},${R(c.hz)} L${R(c.W)},${R(c.H)} Z`, c.p.mid, 0.35);
      for (let i = 1; i < 6; i++) s += ln(c.W * 0.5, -c.H * 0.15, (i / 6) * c.W, c.hz, c.p.deep, 1.5, 0.3);
      for (let i = 0; i < 7; i++) {
        const x = c.W * (0.1 + r() * 0.8);
        s += rectP(x, c.hz + c.H * 0.2, c.W * 0.01, c.H * 0.4, c.p.deep, 0.8);
        for (let j = 0; j < 4; j++) s += ell(x + (r() - 0.5) * c.W * 0.08, c.hz + c.H * (0.22 + j * 0.1), c.W * 0.035, c.H * 0.02, c.p.glow, 0.45);
      }
      return s + particles(c);
    }
    // 森林晨雾
    s += disc(c, 'day');
    s += beams(c, { n: 4 });
    for (const [op, col, n, sc] of [[0.35, c.p.mid, 9, 0.7], [0.6, c.p.deep, 8, 0.9], [0.95, c.p.ink, 7, 1.15]]) {
      for (let i = 0; i < n; i++) {
        const x = (i + 0.5) * c.W / n + (r() - 0.5) * c.W * 0.06;
        s += pine(c, x, c.hz + c.H * (0.1 + r() * 0.06), c.H * (0.28 + r() * 0.2) * sc, col, op);
      }
    }
    s += rectP(0, c.hz + c.H * 0.12, c.W, c.H * 0.2, c.p.deep, 0.55); // 雾带
    s += rectP(0, c.hz + c.H * 0.3, c.W, c.H * 0.2, c.p.mid, 0.25);
    s += particles(c);
    return s;
  },

  /** 旧式影院舞台 / 胶片放映室 */
  stage(c) {
    const r = c.rand;
    let s = '';
    if (c.variant === 1) { // 放映室：放映机 + 光锥 + 胶片盘
      s += rectP(0, c.hz, c.W, c.H - c.hz, c.p.deep, 0.9);
      const px = c.W * 0.22, py = c.H * 0.55;
      s += rectP(px, py, c.W * 0.2, c.H * 0.14, c.p.ink, 0.95);
      s += circ(px + c.W * 0.04, py - c.W * 0.02, c.W * 0.045, c.p.mid, 0.9);
      s += circ(px + c.W * 0.16, py - c.W * 0.02, c.W * 0.045, c.p.mid, 0.9);
      s += poly([[px + c.W * 0.2, py + c.H * 0.02], [c.W, c.H * 0.1], [c.W, c.H * 0.85]], c.p.glow, 0.12);
      return s + particles(c);
    }
    // 舞台：台口拱 + 幕布褶皱 + 银幕 + 观众席
    s += rectP(0, 0, c.W, c.H, c.p.deep, 0.5);
    s += rectP(c.W * 0.14, c.H * 0.14, c.W * 0.72, c.H * 0.56, c.p.mid, 0.35); // 银幕
    for (let i = 0; i < 14; i++) { // 幕布竖褶
      const x = i * c.W / 14;
      s += rectP(x, 0, c.W * 0.045, c.H * (0.12 + r() * 0.04), c.p.deep, 0.85);
    }
    s += rectP(0, 0, c.W * 0.13, c.H, c.p.ink, 0.9);
    s += rectP(c.W * 0.87, 0, c.W * 0.13, c.H, c.p.ink, 0.9);
    s += rectP(0, c.H * 0.7, c.W, c.H * 0.3, c.p.ink, 0.95);
    for (let i = 0; i < 8; i++) s += ell((i + 0.5) * c.W / 8, c.H * (0.78 + r() * 0.14), c.W * 0.035, c.H * 0.03, c.p.deep, 0.9); // 观众头
    s += poly([[c.W * 0.5, c.H * 0.4], [c.W * 0.1, c.H * 0.72], [c.W * 0.9, c.H * 0.72]], c.p.glow, 0.07); // 放映光
    return s + particles(c);
  },

  /** 太空星云与行星 / 高原星空 */
  space(c) {
    const r = c.rand;
    let s = '';
    s += rectP(0, 0, c.W, c.H, c.p.deep, 0.6);
    // 星云团
    for (let i = 0; i < 6; i++) {
      const x = r() * c.W, y = r() * c.H * 0.7;
      s += ell(x, y, c.W * (0.12 + r() * 0.2), c.H * (0.06 + r() * 0.12), i % 2 ? c.p.glow : c.p.mid, 0.18, ' filter="url(#softLg)"');
    }
    s += particles(c); // stars
    if (c.variant === 1) { // 高原星空：银河带 + 雪山 + 帐篷
      s += pth(`M0,${R(c.H * 0.1)} Q${R(c.W * 0.5)},${R(c.H * 0.5)} ${R(c.W)},${R(c.H * 0.05)} L${R(c.W)},${R(c.H * 0.35)} Q${R(c.W * 0.5)},${R(c.H * 0.8)} 0,${R(c.H * 0.4)} Z`, c.p.accent, 0.1);
      s += ridge(c, { baseY: c.hz + c.H * 0.02, amp: c.H * 0.22, peaks: 6, fill: c.p.deep, op: 0.95, snow: true });
      s += poly([[c.W * 0.68, c.hz + c.H * 0.16], [c.W * 0.74, c.hz + c.H * 0.02], [c.W * 0.8, c.hz + c.H * 0.16]], c.p.ink, 0.95);
      s += circ(c.W * 0.74, c.hz + c.H * 0.14, c.W * 0.008, c.p.warm, 0.9);
    } else { // 行星 + 光环
      const px = c.W * 0.72, py = c.H * 0.42, pr = Math.min(c.W, c.H) * 0.17;
      s += circ(px, py, pr * 1.06, c.p.glow, 0.3, ' filter="url(#soft)"');
      s += circ(px, py, pr, c.p.mid, 0.95);
      s += circ(px - pr * 0.3, py - pr * 0.25, pr * 0.72, c.p.deep, 0.55); // 阴影
      s += ell(px, py, pr * 1.7, pr * 0.34, 'none', null, ` stroke="${c.p.accent}" stroke-width="${R(pr * 0.12)}" opacity="0.5" transform="rotate(-22 ${R(px)} ${R(py)})"`);
      s += circ(c.W * 0.2, c.H * 0.22, Math.min(c.W, c.H) * 0.03, c.p.accent, 0.8);
    }
    return s;
  },

  /** 麦田公路 / 高原公路 */
  road(c) {
    const r = c.rand;
    let s = disc(c, c.mood);
    s += ridge(c, { baseY: c.hz, amp: c.H * 0.08, peaks: 7, fill: c.p.mid, op: 0.5 });
    s += rectP(0, c.hz, c.W, c.H - c.hz, c.p.glow, 0.45); // 麦田底色
    // 透视公路
    const topW = c.W * 0.03, botW = c.W * 0.34;
    s += poly([[c.W * 0.5 - topW, c.hz], [c.W * 0.5 + topW, c.hz], [c.W * 0.5 + botW, c.H], [c.W * 0.5 - botW, c.H]], c.p.deep, 0.9);
    s += poly([[c.W * 0.5 - c.W * 0.004, c.hz], [c.W * 0.5 + c.W * 0.004, c.hz], [c.W * 0.5 + c.W * 0.012, c.H], [c.W * 0.5 - c.W * 0.012, c.H]], c.p.warm, 0.5);
    // 麦田行列
    for (let i = 0; i < 9; i++) {
      const t = i / 9;
      for (const side of [-1, 1]) {
        const x = c.W * 0.5 + side * (topW + t * botW * 1.6 + c.W * 0.02);
        s += ln(c.W * 0.5 + side * topW, c.hz, x, c.H, c.p.deep, 1.4, 0.18);
      }
    }
    // 电线杆
    for (let i = 0; i < 4; i++) {
      const t = (i + 1) / 5;
      const x = c.W * 0.5 - topW - t * botW * 1.5;
      const y = c.hz + t * (c.H - c.hz) * 0.9;
      s += ln(x, y, x, y - c.H * (0.1 + t * 0.1), c.p.deep, 2, 0.7);
      s += ln(x, y - c.H * (0.1 + t * 0.1), x - c.W * 0.04, y - c.H * (0.1 + t * 0.1), c.p.deep, 2, 0.7);
    }
    s += particles(c);
    return s;
  },

  /** 雪原孤树 */
  tree(c) {
    const r = c.rand;
    let s = disc(c, 'night');
    s += rectP(0, c.hz, c.W, c.H - c.hz, c.p.accent, 0.32); // 雪地
    s += ln(0, c.hz + c.H * 0.12, c.W, c.hz + c.H * 0.1, c.p.mid, 2, 0.3); // 雪线
    // 孤树
    const x = c.W * 0.42, baseY = c.hz + c.H * 0.24, h = c.H * 0.42;
    s += rectP(x - h * 0.018, baseY - h * 0.7, h * 0.036, h * 0.72, c.p.ink, 0.95);
    for (let i = 0; i < 7; i++) {
      const by = baseY - h * (0.35 + i * 0.09);
      const len = h * (0.3 - i * 0.03);
      s += ln(x, by, x - len, by - h * 0.06, c.p.ink, 2.2, 0.9);
      s += ln(x, by + h * 0.03, x + len * 0.85, by - h * 0.02, c.p.ink, 2, 0.9);
    }
    for (let i = 0; i < 26; i++) { // 稀疏残叶 / 雪挂
      s += circ(x + (r() - 0.5) * h * 0.5, baseY - h * (0.4 + r() * 0.5), 1 + r() * 2, c.p.accent, 0.4);
    }
    // 栅栏
    for (let i = 0; i < 6; i++) {
      const fx = c.W * (0.72 + i * 0.045);
      s += ln(fx, c.hz + c.H * 0.3, fx, c.hz + c.H * 0.22, c.p.deep, 2, 0.6);
    }
    s += particles(c);
    return s;
  },

  /** 峡谷河流 */
  river(c) {
    const r = c.rand;
    let s = disc(c, 'day');
    // 两侧峡谷壁
    s += poly([[0, c.H], [0, c.hz - c.H * 0.1], [c.W * 0.12, c.hz - c.H * 0.2], [c.W * 0.24, c.hz], [c.W * 0.3, c.H]], c.p.mid, 0.8);
    s += poly([[c.W, c.H], [c.W, c.hz - c.H * 0.14], [c.W * 0.84, c.hz - c.H * 0.24], [c.W * 0.72, c.hz], [c.W * 0.66, c.H]], c.p.deep, 0.85);
    s += ridge(c, { baseY: c.hz, amp: c.H * 0.1, peaks: 5, fill: c.p.glow, op: 0.3 });
    // 蜿蜒河流
    s += pth(`M${R(c.W * 0.46)},${R(c.hz)} C${R(c.W * 0.6)},${R(c.hz + c.H * 0.2)} ${R(c.W * 0.34)},${R(c.hz + c.H * 0.36)} ${R(c.W * 0.52)},${R(c.H)} L${R(c.W * 0.72)},${R(c.H)} C${R(c.W * 0.56)},${R(c.hz + c.H * 0.4)} ${R(c.W * 0.78)},${R(c.hz + c.H * 0.2)} ${R(c.W * 0.58)},${R(c.hz)} Z`, c.p.accent, 0.4);
    s += reflection(c, { bands: 8 });
    s += particles(c);
    return s;
  },

  /** 老火车站台 */
  station(c) {
    const r = c.rand;
    let s = '';
    s += rectP(0, c.hz - c.H * 0.42, c.W, c.H * 0.06, c.p.deep, 0.95); // 雨棚
    for (let i = 0; i < 7; i++) s += rectP(c.W * (0.04 + i * 0.15), c.hz - c.H * 0.36, c.W * 0.012, c.H * 0.5, c.p.deep, 0.9); // 柱
    for (let i = 0; i < 5; i++) s += circ(c.W * (0.1 + i * 0.2), c.hz - c.H * 0.32, c.W * 0.008, c.p.warm, 0.75); // 吊灯
    s += rectP(0, c.hz + c.H * 0.14, c.W, c.H * 0.4, c.p.mid, 0.55); // 站台
    // 列车
    s += rectP(c.W * 0.36, c.hz - c.H * 0.1, c.W * 0.66, c.H * 0.34, c.p.deep, 0.95);
    for (let i = 0; i < 6; i++) s += rectP(c.W * (0.39 + i * 0.1), c.hz - c.H * 0.02, c.W * 0.06, c.H * 0.1, c.p.warm, 0.5); // 车窗
    s += circ(c.W * 0.42, c.hz + c.H * 0.24, c.W * 0.025, c.p.ink, 0.9);
    s += circ(c.W * 0.86, c.hz + c.H * 0.24, c.W * 0.025, c.p.ink, 0.9);
    // 铁轨
    s += ln(c.W * 0.5, c.hz + c.H * 0.18, c.W * 0.2, c.H, c.p.deep, 2.5, 0.8);
    s += ln(c.W * 0.6, c.hz + c.H * 0.18, c.W * 0.95, c.H, c.p.deep, 2.5, 0.8);
    s += figure(c, c.W * 0.14, c.hz + c.H * 0.5, 1, c.p.ink, 0.85); // 等车人
    s += particles(c);
    return s;
  },

  /** 山间村落 */
  village(c) {
    const r = c.rand;
    let s = disc(c, 'day');
    s += ridge(c, { baseY: c.hz - c.H * 0.02, amp: c.H * 0.16, peaks: 5, fill: c.p.mid, op: 0.5 });
    s += ridge(c, { baseY: c.hz + c.H * 0.06, amp: c.H * 0.2, peaks: 6, fill: c.p.glow, op: 0.4 });
    // 梯田线
    for (let i = 0; i < 5; i++) s += ln(0, c.hz + c.H * (0.12 + i * 0.07), c.W, c.hz + c.H * (0.1 + i * 0.07), c.p.deep, 1.5, 0.22);
    // 房屋
    for (let i = 0; i < 11; i++) {
      const x = c.W * (0.1 + r() * 0.82);
      const y = c.hz + c.H * (0.08 + r() * 0.3);
      const w = c.W * (0.04 + r() * 0.04), h = c.H * (0.05 + r() * 0.05);
      s += rectP(x, y, w, h, c.p.deep, 0.92);
      s += poly([[x - w * 0.12, y], [x + w * 0.5, y - h * 0.5], [x + w * 1.12, y]], c.p.ink, 0.9);
      s += rectP(x + w * 0.35, y + h * 0.4, w * 0.22, h * 0.4, c.p.warm, 0.6); // 亮窗
    }
    s += particles(c);
    return s;
  },

  /** 夜间便利店 */
  store(c) {
    const r = c.rand;
    let s = '';
    s += rectP(0, 0, c.W, c.hz, c.p.deep, 0.7); // 夜色
    // 店面发光大窗
    s += rectP(c.W * 0.08, c.hz - c.H * 0.34, c.W * 0.84, c.H * 0.44, c.p.warm, 0.22);
    s += rectP(c.W * 0.08, c.hz - c.H * 0.34, c.W * 0.84, c.H * 0.44, 'none', null, ` stroke="${c.p.deep}" stroke-width="${R(c.W * 0.012)}"`);
    // 货架
    for (let i = 0; i < 4; i++) {
      const y = c.hz - c.H * 0.28 + i * c.H * 0.1;
      s += rectP(c.W * 0.12, y, c.W * 0.76, c.H * 0.012, c.p.deep, 0.75);
      for (let j = 0; j < 6; j++) s += rectP(c.W * (0.14 + j * 0.12), y - c.H * 0.06, c.W * 0.06, c.H * 0.055, j % 2 ? c.p.glow : c.p.mid, 0.6);
    }
    s += rectP(0, c.hz + c.H * 0.1, c.W, c.H * 0.4, c.p.deep, 0.9); // 人行道
    s += reflection(c, { bands: 6 });
    s += figure(c, c.W * 0.3, c.hz + c.H * 0.42, 1, c.p.ink, 0.9); // 店员 / 顾客
    // 招牌灯带
    s += rectP(c.W * 0.08, c.hz - c.H * 0.4, c.W * 0.84, c.H * 0.02, c.p.glow, 0.85);
    s += particles(c);
    return s;
  },

  /** 动画（色块人物 / 手绘剪影 / 云海列车 / 纸鹤 / 鲸落 / 信箱） */
  anim(c) {
    const r = c.rand;
    let s = '';
    const v = c.variant;
    if (v === 0) { // 色块人物 + 大圆 + 几何山丘
      s += circ(c.lx, c.ly, Math.min(c.W, c.H) * 0.22, c.p.glow, 0.85);
      s += poly([[0, c.H], [0, c.hz], [c.W * 0.35, c.hz - c.H * 0.12], [c.W * 0.65, c.hz], [c.W, c.hz - c.H * 0.08], [c.W, c.H]], c.p.mid, 0.9);
      s += poly([[0, c.H], [0, c.hz + c.H * 0.1], [c.W * 0.5, c.hz + c.H * 0.02], [c.W, c.hz + c.H * 0.14], [c.W, c.H]], c.p.deep, 0.9);
      // 色块人物
      const x = c.W * 0.5, y = c.hz + c.H * 0.16;
      s += circ(x, y - c.H * 0.13, c.W * 0.05, c.p.accent, 0.95);
      s += rectP(x - c.W * 0.045, y - c.H * 0.08, c.W * 0.09, c.H * 0.18, c.p.warm, 0.95);
      s += rectP(x - c.W * 0.075, y - c.H * 0.06, c.W * 0.03, c.H * 0.14, c.p.accent, 0.9);
      s += rectP(x + c.W * 0.045, y - c.H * 0.06, c.W * 0.03, c.H * 0.14, c.p.accent, 0.9);
      for (let i = 0; i < 4; i++) s += ell(r() * c.W, c.H * (0.12 + r() * 0.2), c.W * 0.09, c.H * 0.02, c.p.accent, 0.5);
    } else if (v === 1) { // 手绘角色剪影 + 大落日
      s += circ(c.W * 0.5, c.H * 0.42, Math.min(c.W, c.H) * 0.3, c.p.glow, 0.9);
      s += rectP(0, c.hz, c.W, c.H - c.hz, c.p.mid, 0.9);
      s += figure(c, c.W * 0.5, c.H * 0.94, 1.6, c.p.ink, 0.95);
      for (let i = 0; i < 40; i++) s += ln(r() * c.W, c.hz + c.H * 0.1 + r() * c.H * 0.4, r() * c.W, c.hz + c.H * 0.02 + r() * c.H * 0.4, c.p.deep, 1.2, 0.4); // 草
    } else if (v === 2) { // 云海列车
      s += circ(c.lx, c.ly, Math.min(c.W, c.H) * 0.13, c.p.warm, 0.85);
      for (let i = 0; i < 7; i++) s += ell(r() * c.W, c.H * (0.45 + r() * 0.35), c.W * (0.18 + r() * 0.2), c.H * 0.05, c.p.accent, 0.35);
      s += rectP(c.W * 0.2, c.hz + c.H * 0.04, c.W * 0.6, c.H * 0.1, c.p.deep, 0.95);
      for (let i = 0; i < 5; i++) s += rectP(c.W * (0.23 + i * 0.11), c.hz + c.H * 0.06, c.W * 0.07, c.H * 0.045, c.p.warm, 0.7);
      s += circ(c.W * 0.3, c.hz + c.H * 0.15, c.W * 0.018, c.p.ink, 0.9);
      s += circ(c.W * 0.7, c.hz + c.H * 0.15, c.W * 0.018, c.p.ink, 0.9);
    } else if (v === 3) { // 纸鹤飞过城市
      s += skyline(c, { count: 12, minH: 0.08, maxH: 0.28, col: c.p.mid, op: 0.5, windows: true });
      s += rectP(0, c.hz, c.W, c.H - c.hz, c.p.deep, 0.9);
      const kx = c.W * 0.6, ky = c.H * 0.34;
      s += poly([[kx, ky], [kx - c.W * 0.09, ky - c.H * 0.06], [kx - c.W * 0.02, ky + c.H * 0.02], [kx - c.W * 0.06, ky + c.H * 0.08], [kx + c.W * 0.02, ky + c.H * 0.03]], c.p.accent, 0.95);
      s += poly([[kx, ky], [kx + c.W * 0.1, ky - c.H * 0.04], [kx + c.W * 0.03, ky + c.H * 0.01], [kx + c.W * 0.07, ky + c.H * 0.07], [kx + c.W * 0.01, ky + c.H * 0.02]], c.p.warm, 0.9);
      for (let i = 0; i < 5; i++) s += poly([[r() * c.W, r() * c.H * 0.5], [0, 0], [0, 0]].map((p, j) => j ? [p[0] + c.W * 0.02, p[1] - c.H * 0.01] : p), c.p.accent, 0.5);
    } else if (v === 4) { // 鲸落森林
      s += circ(c.W * 0.5, c.H * 0.3, Math.min(c.W, c.H) * 0.2, c.p.glow, 0.4, ' filter="url(#softLg)"');
      const wx = c.W * 0.5, wy = c.H * 0.42;
      s += ell(wx, wy, c.W * 0.22, c.H * 0.07, c.p.deep, 0.9);
      s += poly([[wx + c.W * 0.2, wy], [wx + c.W * 0.3, wy - c.H * 0.06], [wx + c.W * 0.28, wy + c.H * 0.06]], c.p.deep, 0.9);
      for (let i = 0; i < 9; i++) s += pine(c, (i + 0.5) * c.W / 9, c.H, c.H * (0.2 + r() * 0.12), i % 2 ? c.p.mid : c.p.deep, 0.8);
      for (let i = 0; i < 20; i++) s += circ(r() * c.W, r() * c.H, 1 + r() * 3, c.p.accent, 0.4);
    } else { // 夏末信箱
      s += circ(c.lx, c.ly, Math.min(c.W, c.H) * 0.16, c.p.warm, 0.8);
      s += rectP(0, c.hz, c.W, c.H - c.hz, c.p.mid, 0.85);
      s += rectP(c.W * 0.44, c.hz + c.H * 0.1, c.W * 0.12, c.H * 0.3, c.p.deep, 0.95); // 柱
      s += rectP(c.W * 0.38, c.hz + c.H * 0.02, c.W * 0.24, c.H * 0.12, c.p.glow, 0.95); // 箱体
      s += rectP(c.W * 0.38, c.hz + c.H * 0.02, c.W * 0.24, c.H * 0.03, c.p.deep, 0.9);
      s += poly([[c.W * 0.46, c.hz + c.H * 0.1], [c.W * 0.54, c.hz + c.H * 0.1], [c.W * 0.5, c.hz + c.H * 0.16]], c.p.accent, 0.9); // 信封
      for (let i = 0; i < 30; i++) s += ln(r() * c.W, c.hz + c.H * 0.3 + r() * c.H * 0.4, r() * c.W, c.hz + c.H * 0.2 + r() * c.H * 0.4, c.p.deep, 1.2, 0.35);
    }
    return s + particles(c);
  },

  /** 纪录片野生动物剪影 */
  wildlife(c) {
    const r = c.rand;
    let s = disc(c, 'day');
    s += rectP(0, c.hz, c.W, c.H - c.hz, c.p.mid, 0.85);
    // 金合欢树
    const tx = c.W * 0.2;
    s += ln(tx, c.hz + c.H * 0.2, tx, c.hz - c.H * 0.1, c.p.ink, c.W * 0.012, 0.9);
    s += ell(tx, c.hz - c.H * 0.12, c.W * 0.16, c.H * 0.04, c.p.ink, 0.9);
    // 鹿 / 羚羊剪影
    const ax = c.W * 0.62, ay = c.hz + c.H * 0.2;
    s += ell(ax, ay, c.W * 0.075, c.H * 0.045, c.p.ink, 0.95);
    s += ell(ax + c.W * 0.07, ay - c.H * 0.06, c.W * 0.028, c.H * 0.035, c.p.ink, 0.95);
    s += ln(ax + c.W * 0.08, ay - c.H * 0.08, ax + c.W * 0.1, ay - c.H * 0.16, c.p.ink, 2.5, 0.9);
    s += ln(ax + c.W * 0.06, ay - c.H * 0.08, ax + c.W * 0.04, ay - c.H * 0.16, c.p.ink, 2.5, 0.9);
    for (const lx of [ax - c.W * 0.05, ax + c.W * 0.045]) {
      s += ln(lx, ay + c.H * 0.03, lx - c.W * 0.005, ay + c.H * 0.14, c.p.ink, 3, 0.9);
      s += ln(lx + c.W * 0.02, ay + c.H * 0.03, lx + c.W * 0.025, ay + c.H * 0.14, c.p.ink, 3, 0.9);
    }
    for (let i = 0; i < 34; i++) s += ln(r() * c.W, c.hz + c.H * 0.3 + r() * c.H * 0.4, r() * c.W, c.hz + c.H * 0.22 + r() * c.H * 0.4, c.p.deep, 1.2, 0.3);
    s += particles(c);
    return s;
  },

  /** 显微 / 地貌纹理（等高线） */
  texture(c) {
    const r = c.rand;
    let s = '';
    s += rectP(0, 0, c.W, c.H, c.p.mid, 0.45);
    const cx = c.W * (0.35 + r() * 0.3), cy = c.H * (0.4 + r() * 0.2);
    for (let i = 0; i < 11; i++) {
      const rr = (i + 1) * Math.min(c.W, c.H) * 0.055;
      const pts = [];
      for (let a = 0; a <= 36; a++) {
        const ang = (a / 36) * Math.PI * 2;
        const wob = 1 + Math.sin(ang * (3 + i % 3) + i) * 0.12 + r() * 0.05;
        pts.push([cx + Math.cos(ang) * rr * wob, cy + Math.sin(ang) * rr * wob * 0.78]);
      }
      const d = pts.map(([x, y], k) => `${k ? 'L' : 'M'}${R(x)},${R(y)}`).join(' ') + ' Z';
      s += pth(d, 'none', null, ` stroke="${i % 3 === 0 ? c.p.accent : c.p.deep}" stroke-width="${R(1 + r() * 1.4)}" opacity="${R(0.25 + r() * 0.3)}"`);
    }
    for (let i = 0; i < 40; i++) s += circ(r() * c.W, r() * c.H, 0.8 + r() * 2.4, c.p.warm, 0.1 + r() * 0.2);
    return s;
  },

  /** 家庭录像室内 / 门廊光影 / 楼梯间 / 灯塔内景 */
  interior(c) {
    const r = c.rand;
    let s = '';
    const v = c.variant;
    // 室内墙面 + 地板透视
    s += rectP(0, 0, c.W, c.hz, c.p.mid, 0.6);
    s += rectP(0, c.hz, c.W, c.H - c.hz, c.p.deep, 0.85);
    for (let i = 1; i < 5; i++) s += ln(0, c.hz + (i / 5) * (c.H - c.hz), c.W, c.hz + (i / 5) * (c.H - c.hz), c.p.ink, 1, 0.15);
    // 窗 / 门的光
    const wx = v === 0 ? c.W * 0.62 : v === 1 ? c.W * 0.3 : c.W * 0.7;
    const wy = c.H * 0.12, ww = c.W * 0.26, wh = c.H * 0.46;
    s += rectP(wx, wy, ww, wh, c.p.warm, 0.5);
    s += rectP(wx, wy, ww, wh, 'none', null, ` stroke="${c.p.deep}" stroke-width="${R(c.W * 0.01)}"`);
    s += ln(wx + ww / 2, wy, wx + ww / 2, wy + wh, c.p.deep, c.W * 0.006, 0.6);
    s += poly([[wx, wy + wh], [wx + ww, wy + wh], [wx + ww * 1.6, c.H], [wx - ww * 0.5, c.H]], c.p.warm, 0.1); // 光斑
    if (v === 0) { // 室内快照：桌 + 椅 + 人 + 台灯
      s += rectP(c.W * 0.1, c.hz + c.H * 0.14, c.W * 0.42, c.H * 0.02, c.p.ink, 0.9);
      s += rectP(c.W * 0.14, c.hz + c.H * 0.16, c.W * 0.02, c.H * 0.24, c.p.ink, 0.9);
      s += rectP(c.W * 0.56, c.hz + c.H * 0.16, c.W * 0.02, c.H * 0.24, c.p.ink, 0.9);
      s += rectP(c.W * 0.2, c.hz + c.H * 0.05, c.W * 0.1, c.H * 0.09, c.p.glow, 0.8); // 台灯
      s += figure(c, c.W * 0.42, c.hz + c.H * 0.46, 1.15, c.p.ink, 0.8);
    } else if (v === 2) { // 楼梯间
      for (let i = 0; i < 6; i++) {
        s += rectP(c.W * 0.08, c.hz + c.H * (0.06 + i * 0.07), c.W * (0.5 - i * 0.06), c.H * 0.05, c.p.ink, 0.85);
        s += ln(c.W * 0.08, c.hz + c.H * (0.06 + i * 0.07), c.W * 0.08, c.hz + c.H * (0.11 + i * 0.07), c.p.ink, 3, 0.8);
      }
    } else if (v === 3) { // 灯塔内景：旋梯 + 灯
      s += ell(c.W * 0.72, c.H * 0.24, c.W * 0.08, c.H * 0.1, c.p.warm, 0.7, ' filter="url(#soft)"');
      for (let i = 0; i < 7; i++) s += ln(c.W * 0.72, c.H * 0.3, c.W * (0.2 + i * 0.08), c.H * (0.5 + i * 0.06), c.p.ink, 2, 0.5);
    } else { // 门廊：门框 + 人影
      s += rectP(c.W * 0.08, c.H * 0.08, c.W * 0.28, c.H * 0.8, c.p.ink, 0.85);
      s += figure(c, c.W * 0.5, c.H * 0.92, 1.4, c.p.ink, 0.55);
    }
    s += particles(c);
    return s;
  },

  /** 静物：咖啡馆窗景 / 书架 / 花店 / 老电视 / 黑胶 / 旧相册 / 雨窗 */
  stillLife(c) {
    const r = c.rand;
    let s = '';
    const v = c.variant;
    s += rectP(0, 0, c.W, c.H, c.p.mid, 0.55);
    s += rectP(0, c.hz + c.H * 0.16, c.W, c.H * 0.4, c.p.deep, 0.9); // 桌面
    if (v === 0 || v === 6) { // 窗景 / 雨窗
      s += rectP(c.W * 0.08, c.H * 0.08, c.W * 0.84, c.H * 0.6, c.p.glow, 0.35);
      s += rectP(c.W * 0.08, c.H * 0.08, c.W * 0.84, c.H * 0.6, 'none', null, ` stroke="${c.p.deep}" stroke-width="${R(c.W * 0.012)}"`);
      s += ln(c.W * 0.5, c.H * 0.08, c.W * 0.5, c.H * 0.68, c.p.deep, c.W * 0.008, 0.7);
      for (let i = 0; i < 6; i++) s += ell(r() * c.W, r() * c.H * 0.6, c.W * 0.08, c.H * 0.03, c.p.accent, 0.3);
      s += rectP(c.W * 0.2, c.hz + c.H * 0.02, c.W * 0.6, c.H * 0.16, c.p.deep, 0.8); // 窗台
    }
    if (v === 0 || v === 4) { // 杯子 / 黑胶
      s += ell(c.W * 0.4, c.hz + c.H * 0.14, c.W * 0.09, c.H * 0.03, c.p.accent, 0.85);
      s += rectP(c.W * 0.34, c.hz + c.H * 0.02, c.W * 0.12, c.H * 0.13, c.p.warm, 0.85);
      s += ell(c.W * 0.4, c.hz + c.H * 0.02, c.W * 0.06, c.H * 0.02, c.p.deep, 0.8);
    }
    if (v === 1) { // 书架
      for (let i = 0; i < 3; i++) {
        const y = c.H * (0.12 + i * 0.24);
        s += rectP(c.W * 0.1, y, c.W * 0.8, c.H * 0.02, c.p.deep, 0.9);
        for (let j = 0; j < 9; j++) {
          const bw = c.W * (0.04 + r() * 0.03);
          s += rectP(c.W * 0.12 + j * c.W * 0.085, y - c.H * (0.1 + r() * 0.08), bw, c.H * (0.1 + r() * 0.08), j % 3 === 0 ? c.p.glow : j % 2 ? c.p.deep : c.p.mid, 0.85);
        }
      }
    }
    if (v === 2) { // 花店花束
      for (let i = 0; i < 7; i++) {
        const x = c.W * (0.3 + r() * 0.4);
        s += ln(c.W * 0.5, c.hz + c.H * 0.16, x, c.H * (0.2 + r() * 0.2), c.p.deep, 2, 0.8);
        s += circ(x, c.H * (0.2 + r() * 0.2), c.W * (0.02 + r() * 0.02), i % 2 ? c.p.warm : c.p.accent, 0.9);
      }
      s += poly([[c.W * 0.4, c.hz + c.H * 0.16], [c.W * 0.6, c.hz + c.H * 0.16], [c.W * 0.56, c.H * 0.92], [c.W * 0.44, c.H * 0.92]], c.p.glow, 0.6); // 花瓶
    }
    if (v === 3) { // 老电视机
      s += rectP(c.W * 0.16, c.H * 0.18, c.W * 0.68, c.H * 0.5, c.p.deep, 0.95);
      s += rectP(c.W * 0.2, c.H * 0.22, c.W * 0.52, c.H * 0.4, c.p.glow, 0.4);
      s += circ(c.W * 0.82, c.H * 0.32, c.W * 0.03, c.p.warm, 0.8);
      s += circ(c.W * 0.82, c.H * 0.44, c.W * 0.03, c.p.warm, 0.8);
      s += ln(c.W * 0.9, c.H * 0.2, c.W * 0.98, c.H * 0.08, c.p.ink, 2, 0.8);
    }
    if (v === 4) { // 黑胶唱片
      s += circ(c.W * 0.5, c.H * 0.42, c.W * 0.24, c.p.ink, 0.95);
      for (let i = 0; i < 6; i++) s += circ(c.W * 0.5, c.H * 0.42, c.W * (0.08 + i * 0.028), 'none', null, ` stroke="${c.p.mid}" stroke-width="1" opacity="0.4"`);
      s += circ(c.W * 0.5, c.H * 0.42, c.W * 0.05, c.p.warm, 0.9);
      s += ln(c.W * 0.5, c.H * 0.42, c.W * 0.86, c.H * 0.7, c.p.accent, 3, 0.8); // 唱臂
    }
    if (v === 5) { // 旧相册
      s += rectP(c.W * 0.16, c.H * 0.22, c.W * 0.68, c.H * 0.46, c.p.warm, 0.85);
      s += rectP(c.W * 0.2, c.H * 0.26, c.W * 0.28, c.H * 0.34, c.p.mid, 0.9);
      s += rectP(c.W * 0.52, c.H * 0.26, c.W * 0.28, c.H * 0.34, c.p.deep, 0.9);
      s += figure(c, c.W * 0.34, c.H * 0.56, 0.6, c.p.ink, 0.7);
      s += circ(c.W * 0.66, c.H * 0.38, c.W * 0.05, c.p.glow, 0.7);
    }
    s += particles(c);
    return s;
  },

  /** 海岸航拍 / 车站抓拍 */
  aerial(c) {
    const r = c.rand;
    let s = '';
    if (c.variant === 1) { // 车站抓拍：俯视站台 + 人物
      s += rectP(0, 0, c.W, c.H, c.p.mid, 0.55);
      s += rectP(0, c.H * 0.42, c.W, c.H * 0.06, c.p.deep, 0.9);
      for (let i = 0; i < 6; i++) s += ln(c.W * (i / 6), c.H * 0.48, c.W * (i / 6), c.H, c.p.deep, 1.5, 0.3);
      for (let i = 0; i < 5; i++) {
        const x = r() * c.W, y = c.H * (0.55 + r() * 0.4);
        s += circ(x, y, c.W * 0.018, c.p.ink, 0.8);
        s += ell(x, y + c.W * 0.035, c.W * 0.022, c.H * 0.03, c.p.ink, 0.8);
      }
    } else { // 海岸航拍：海陆交界 + 浪线 + 礁石
      s += rectP(0, 0, c.W, c.H * 0.55, c.p.deep, 0.75);
      s += poly([[0, c.H * 0.55], [c.W * 0.3, c.H * 0.42], [c.W * 0.6, c.H * 0.6], [c.W, c.H * 0.48]], c.p.mid, 0.9);
      s += poly([[0, c.H * 0.55], [c.W * 0.3, c.H * 0.42], [c.W * 0.6, c.H * 0.6], [c.W, c.H * 0.48], [c.W, c.H], [0, c.H]], c.p.glow, 0.28);
      for (let i = 0; i < 5; i++) {
        const y = c.H * (0.5 + i * 0.1);
        s += pth(`M0,${R(y)} Q${R(c.W * 0.3)},${R(y - c.H * 0.04)} ${R(c.W * 0.55)},${R(y)} T${R(c.W)},${R(y - c.H * 0.02)}`, 'none', null, ` stroke="${c.p.accent}" stroke-width="${R(2 + r() * 2)}" opacity="0.35"`);
      }
      for (let i = 0; i < 8; i++) s += ell(r() * c.W, c.H * (0.65 + r() * 0.3), c.W * (0.01 + r() * 0.03), c.H * 0.012, c.p.deep, 0.7);
    }
    s += particles(c);
    return s;
  },
};

/* ------------------------------------------------------------------ */
/* 48 个场景定义（8 个比例+分类家族）                                   */
/* ------------------------------------------------------------------ */

const F = (theme, b, pal, hz, lx, ly, mood, particles, variant = 0) =>
  ({ theme, b, pal, hz, lx, ly, mood, particles, variant });

const SCENES = [
  // 家族 1：2:3 / cinematic-poster（电影风格竖版海报 ×8）
  F('雨夜霓虹街道', 'city', 0, 0.66, 0.7, 0.2, 'night', 'rain', 1),
  F('雾港灯塔', 'harbour', 2, 0.6, 0.68, 0.26, 'night', 'none', 0),
  F('雪山脊线', 'mountains', 6, 0.6, 0.72, 0.22, 'day', 'snow', 0),
  F('沙漠日落', 'desert', 4, 0.58, 0.7, 0.34, 'day', 'dust', 0),
  F('深海沉船', 'shipwreck', 5, 0.5, 0.5, 0.1, 'night', 'bubbles', 0),
  F('森林晨雾', 'forest', 3, 0.62, 0.32, 0.2, 'day', 'dust', 0),
  F('城市天际线剪影', 'city', 8, 0.64, 0.78, 0.22, 'night', 'stars', 0),
  F('旧式影院舞台', 'stage', 7, 0.6, 0.5, 0.3, 'interior', 'dust', 0),

  // 家族 2：16:9 / widescreen-still（横版电影剧照 ×8）
  F('太空星云与行星', 'space', 2, 0.5, 0.72, 0.42, 'night', 'stars', 0),
  F('麦田公路', 'road', 4, 0.5, 0.5, 0.24, 'day', 'none', 0),
  F('雪原孤树', 'tree', 6, 0.56, 0.7, 0.2, 'night', 'snow', 0),
  F('峡谷河流', 'river', 9, 0.52, 0.42, 0.24, 'day', 'none', 0),
  F('老火车站台', 'station', 11, 0.6, 0.5, 0.2, 'interior', 'dust', 0),
  F('水下光束', 'shipwreck', 5, 0.5, 0.5, 0.05, 'night', 'bubbles', 1),
  F('山间村落', 'village', 14, 0.54, 0.7, 0.22, 'day', 'dust', 0),
  F('暴风海岸', 'harbour', 15, 0.56, 0.24, 0.3, 'night', 'rain', 1),

  // 家族 3：4:3 / documentary（纪录片摄影图 ×6）
  F('高原星空', 'space', 10, 0.66, 0.5, 0.2, 'night', 'stars', 1),
  F('竹影庭院', 'forest', 12, 0.66, 0.74, 0.24, 'night', 'none', 1),
  F('纪录片野生动物剪影', 'wildlife', 11, 0.56, 0.78, 0.26, 'day', 'dust', 0),
  F('显微与地貌纹理', 'texture', 9, 0.5, 0.5, 0.45, 'day', 'none', 0),
  F('夜间便利店纪实', 'store', 7, 0.62, 0.5, 0.2, 'night', 'rain', 0),
  F('胶片放映室纪实', 'stage', 8, 0.6, 0.78, 0.22, 'interior', 'dust', 1),

  // 家族 4：2:3 / animation（动画风格海报 ×6）
  F('动画色块人物', 'anim', 12, 0.62, 0.7, 0.26, 'day', 'none', 0),
  F('手绘感角色剪影', 'anim', 4, 0.66, 0.5, 0.4, 'day', 'leaves', 1),
  F('动画云海列车', 'anim', 3, 0.58, 0.72, 0.24, 'day', 'none', 2),
  F('动画纸鹤城市', 'anim', 10, 0.64, 0.6, 0.3, 'night', 'stars', 3),
  F('动画鲸落森林', 'anim', 5, 0.6, 0.5, 0.3, 'night', 'bubbles', 4),
  F('动画夏末信箱', 'anim', 4, 0.62, 0.68, 0.26, 'day', 'leaves', 5),

  // 家族 5：1:1 / personal（个人视频缩略图 ×6）
  F('家庭录像·室内快照', 'interior', 7, 0.6, 0.62, 0.2, 'interior', 'dust', 0),
  F('家庭录像·门廊光影', 'interior', 11, 0.6, 0.3, 0.2, 'interior', 'dust', 1),
  F('家庭录像·窗台午后', 'interior', 13, 0.6, 0.7, 0.2, 'interior', 'dust', 0),
  F('家庭录像·旧相册桌面', 'stillLife', 11, 0.62, 0.5, 0.2, 'interior', 'dust', 5),
  F('家庭录像·雨窗', 'stillLife', 0, 0.6, 0.5, 0.2, 'night', 'rain', 6),
  F('家庭录像·车站抓拍', 'aerial', 15, 0.5, 0.5, 0.2, 'interior', 'dust', 1),

  // 家族 6：5:4 / square（方形归档 ×5）
  F('静物·咖啡馆窗景', 'stillLife', 13, 0.6, 0.5, 0.2, 'day', 'none', 0),
  F('静物·书架一角', 'stillLife', 11, 0.6, 0.5, 0.2, 'interior', 'dust', 1),
  F('静物·街角花店', 'stillLife', 9, 0.6, 0.5, 0.2, 'day', 'leaves', 2),
  F('静物·老式电视机', 'stillLife', 8, 0.6, 0.5, 0.2, 'interior', 'dust', 3),
  F('静物·黑胶唱片', 'stillLife', 7, 0.6, 0.5, 0.2, 'interior', 'dust', 4),

  // 家族 7：4:5 / irregular（不规则 4:5 ×5）
  F('竖幅·楼梯间', 'interior', 6, 0.6, 0.7, 0.2, 'interior', 'dust', 2),
  F('竖幅·灯塔内景', 'interior', 7, 0.6, 0.72, 0.24, 'interior', 'dust', 3),
  F('竖幅·温室植物', 'forest', 14, 0.62, 0.5, 0.2, 'day', 'leaves', 2),
  F('竖幅·人像剪影', 'anim', 8, 0.66, 0.5, 0.4, 'day', 'none', 1),
  F('竖幅·山间梯田', 'village', 14, 0.58, 0.68, 0.24, 'day', 'dust', 0),

  // 家族 8：3:2 / irregular（不规则 3:2 ×4）
  F('高原公路', 'road', 9, 0.52, 0.5, 0.22, 'day', 'none', 0),
  F('海岸航拍', 'aerial', 5, 0.5, 0.5, 0.2, 'day', 'none', 0),
  F('田野远山', 'mountains', 14, 0.58, 0.72, 0.22, 'day', 'none', 2),
  F('黄昏操场', 'city', 4, 0.6, 0.7, 0.26, 'day', 'dust', 2),
];

/** 家族定义：与 demo-artwork.ts 的 FAMILIES 必须完全一致 */
const FAMILIES = [
  { ratio: '2x3', cat: 'cp', count: 8 },
  { ratio: '16x9', cat: 'ws', count: 8 },
  { ratio: '4x3', cat: 'dc', count: 6 },
  { ratio: '2x3', cat: 'an', count: 6 },
  { ratio: '1x1', cat: 'pv', count: 6 },
  { ratio: '5x4', cat: 'sq', count: 5 },
  { ratio: '4x5', cat: 'ir', count: 5 },
  { ratio: '3x2', cat: 'ir', count: 4 },
];

/* ------------------------------------------------------------------ */
/* SVG 包装                                                            */
/* ------------------------------------------------------------------ */

function esc(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function buildSvg(c, inner) {
  const p = c.p;
  const cx = R(c.lx / c.W), cy = R(c.ly / c.H);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${c.W} ${c.H}" width="${c.W}" height="${c.H}" role="img" aria-label="${esc(c.theme)}">
<defs>
<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${p.top}"/><stop offset="1" stop-color="${p.mid}"/></linearGradient>
<radialGradient id="sun" cx="${cx}" cy="${cy}" r="0.66"><stop offset="0" stop-color="${p.glow}" stop-opacity="0.88"/><stop offset="0.34" stop-color="${p.glow}" stop-opacity="0.3"/><stop offset="1" stop-color="${p.glow}" stop-opacity="0"/></radialGradient>
<linearGradient id="ground" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${p.mid}"/><stop offset="1" stop-color="${p.deep}"/></linearGradient>
<linearGradient id="scrim" x1="0" y1="0" x2="0" y2="1"><stop offset="0.58" stop-color="${p.ink}" stop-opacity="0"/><stop offset="1" stop-color="${p.ink}" stop-opacity="0.34"/></linearGradient>
<radialGradient id="vig" cx="0.5" cy="0.44" r="0.8"><stop offset="0.55" stop-color="${p.ink}" stop-opacity="0"/><stop offset="1" stop-color="${p.ink}" stop-opacity="0.2"/></radialGradient>
<filter id="soft" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="${R(c.W * 0.008)}"/></filter>
<filter id="softLg" x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="${R(c.W * 0.03)}"/></filter>
<filter id="grain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.68" numOctaves="1" stitchTiles="stitch" result="n"/><feColorMatrix in="n" type="saturate" values="0"/></filter>
</defs>
<rect width="${c.W}" height="${c.H}" fill="url(#sky)"/>
<rect width="${c.W}" height="${c.H}" fill="url(#sun)"/>
${inner}
<rect width="${c.W}" height="${c.H}" fill="url(#scrim)"/>
<rect width="${c.W}" height="${c.H}" fill="url(#vig)"/>
<rect width="${c.W}" height="${c.H}" fill="#000000" opacity="0.05" filter="url(#grain)"/>
</svg>`;
}

/* ------------------------------------------------------------------ */
/* 主流程                                                              */
/* ------------------------------------------------------------------ */

function main() {
  if (SCENES.length !== FAMILIES.reduce((n, f) => n + f.count, 0)) {
    throw new Error(`SCENES(${SCENES.length}) 与 FAMILIES 总数不一致`);
  }
  mkdirSync(OUT_DIR, { recursive: true });
  // 清理本生成器上一轮残留的 ym-*.svg，保证目录里恰好是本次生成的 48 张
  for (const f of readdirSync(OUT_DIR)) {
    if (/^ym-\d{2}-.*\.svg$/.test(f)) rmSync(join(OUT_DIR, f));
  }

  const files = [];
  let idx = 0;
  for (let fi = 0; fi < FAMILIES.length; fi++) {
    const fam = FAMILIES[fi];
    const [W, H] = RATIO_DIMS[fam.ratio];
    for (let j = 0; j < fam.count; j++, idx++) {
      const scene = SCENES[idx];
      const c = {
        W, H, hz: Math.round(H * scene.hz), lx: Math.round(W * scene.lx), ly: Math.round(H * scene.ly),
        p: grade(PALETTES[scene.pal % PALETTES.length], idx),
        rand: rng(0x9e3779b9 ^ Math.imul(idx + 1, 0x85ebca6b)),
        theme: scene.theme, mood: scene.mood, particles: scene.particles, variant: scene.variant, i: idx,
      };
      const inner = BUILDERS[scene.b](c);
      const svg = buildSvg(c, inner);
      const name = `ym-${pad2(idx + 1)}-${fam.ratio}-${fam.cat}`;
      writeFileSync(join(OUT_DIR, `${name}.svg`), svg, 'utf8');
      files.push({ name: `${name}.svg`, bytes: Buffer.byteLength(svg, 'utf8'), theme: scene.theme, ratio: fam.ratio, cat: fam.cat });
    }
  }

  const aspects = [...new Set(FAMILIES.map((f) => f.ratio))];
  const cats = [...new Set(FAMILIES.map((f) => f.cat))];
  const maxBytes = Math.max(...files.map((f) => f.bytes));
  console.log(`影幕 · 原创演示封面生成完成`);
  console.log(`数量: ${files.length} 张 SVG -> ${OUT_DIR}`);
  console.log(`比例种类(${aspects.length}): ${aspects.join(', ')}`);
  console.log(`分类种类(${cats.length}): ${cats.join(', ')}`);
  console.log(`最大单文件: ${maxBytes} bytes (< 25 KB: ${maxBytes < 25 * 1024 ? 'OK' : 'FAIL'})`);
  console.log(`文件清单:`);
  for (const f of files) console.log(`  ${f.name.padEnd(22)} ${String(f.bytes).padStart(6)} B  ${f.ratio.padEnd(5)} ${f.cat.padEnd(3)}  ${f.theme}`);
}

main();
