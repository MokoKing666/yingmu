/**
 * 程序化封面生成（Artwork）
 *
 * 所有封面由手工 SVG 模板 + 确定性几何参数即时生成，具备以下性质：
 * - 完全离线，不请求 TMDB / 外部图床，不引入任何第三方版权素材；
 * - 同一 seed 永远得到同一张图，可作为 Artwork Cache 的键；
 * - 视觉语言与原创 Logo 一致（银幕画幅 / 光圈 / 放映光束）；
 * - 全部是「演示数据封面」，不代表真实刮削结果，UI 中有明确标注。
 *
 * 正式实现由 Rust Artwork Cache（crates/yingmu-core/src/artwork/）负责
 * 多尺寸缓存、预加载、淘汰与重建；本模块仅服务 WebDemoBridge。
 */

import type { ArtworkRequest } from '@yingmu/media-models';
import { hashString } from './format';

export interface ArtworkSpec {
  seed: string;
  title: string;
  subtitle?: string;
  width: number;
  height: number;
  /** poster 竖版 / backdrop 横版 / square 方形 */
  composition?: 'poster' | 'backdrop' | 'square';
  /**
   * 是否在封面 SVG 内绘制片名。默认 false：
   * 磁贴与详情页已有独立文字层，封面保持纯几何图形，避免文字重复叠加。
   * 仅在需要独立海报资产（例如导出）时开启。
   */
  showTitle?: boolean;
}

/** 低饱和电影感色板，刻意避开紫粉渐变 */
const PALETTES: Array<{ base: string; deep: string; glow: string; accent: string }> = [
  { base: '#10232B', deep: '#07151B', glow: '#2E6A70', accent: '#8FC3C6' },
  { base: '#2B1B14', deep: '#170D09', glow: '#7A4B25', accent: '#D9A55B' },
  { base: '#141C2B', deep: '#0A0F18', glow: '#345581', accent: '#8FAFCF' },
  { base: '#14211C', deep: '#0A120E', glow: '#3B6249', accent: '#93BE9F' },
  { base: '#16181C', deep: '#0C0D10', glow: '#454C56', accent: '#B3BAC2' },
  { base: '#241A18', deep: '#130D0C', glow: '#644035', accent: '#C6927A' },
  { base: '#22201A', deep: '#12110E', glow: '#5F5330', accent: '#D6BE82' },
  { base: '#101826', deep: '#080C14', glow: '#2F4E76', accent: '#86A7CB' },
];

function escapeXml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** 四种几何构图，全部复用「光圈 + 光束」的品牌母题 */
function motif(index: number, w: number, h: number, accent: string, glow: string): string {
  const cx = Math.round(w * 0.34);
  const cy = Math.round(h * 0.36);
  const r = Math.round(Math.min(w, h) * 0.24);

  switch (index % 4) {
    case 0:
      return `
        <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${accent}" stroke-width="${Math.max(3, r * 0.16)}" opacity="0.62"/>
        <circle cx="${cx}" cy="${cy}" r="${Math.round(r * 0.34)}" fill="${accent}" opacity="0.34"/>
        <g fill="${accent}" opacity="0.16">
          <rect x="${Math.round(w * 0.52)}" y="${cy - r * 0.55}" width="${Math.round(w * 0.36)}" height="${Math.max(2, r * 0.08)}" rx="2"/>
          <rect x="${Math.round(w * 0.48)}" y="${cy}" width="${Math.round(w * 0.4)}" height="${Math.max(2, r * 0.08)}" rx="2"/>
          <rect x="${Math.round(w * 0.44)}" y="${cy + r * 0.55}" width="${Math.round(w * 0.44)}" height="${Math.max(2, r * 0.08)}" rx="2"/>
        </g>`;
    case 1:
      return `
        <g opacity="0.2" fill="${accent}" transform="rotate(-28 ${w / 2} ${h / 2})">
          <rect x="${-w * 0.2}" y="${h * 0.2}" width="${w * 1.5}" height="${h * 0.035}" rx="4"/>
          <rect x="${-w * 0.2}" y="${h * 0.34}" width="${w * 1.5}" height="${h * 0.06}" rx="4"/>
          <rect x="${-w * 0.2}" y="${h * 0.52}" width="${w * 1.5}" height="${h * 0.09}" rx="4"/>
        </g>
        <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${glow}" stroke-width="2" opacity="0.5"/>`;
    case 2:
      return `
        <path d="M0 ${h * 0.72} L${w * 0.28} ${h * 0.46} L${w * 0.48} ${h * 0.66} L${w * 0.72} ${h * 0.34} L${w} ${h * 0.6} L${w} ${h} L0 ${h} Z" fill="${glow}" opacity="0.34"/>
        <circle cx="${Math.round(w * 0.72)}" cy="${Math.round(h * 0.24)}" r="${Math.round(r * 0.6)}" fill="${accent}" opacity="0.4"/>`;
    default:
      return `
        <g opacity="0.12" fill="${accent}">
          ${Array.from({ length: 9 }, (_, i) => `<rect x="${Math.round((i * w) / 9)}" y="0" width="${Math.round(w / 22)}" height="${h}"/>`).join('')}
        </g>
        <rect x="${Math.round(w * 0.1)}" y="${Math.round(h * 0.22)}" width="${Math.round(w * 0.8)}" height="${Math.round(h * 0.44)}" rx="${Math.round(h * 0.06)}" fill="none" stroke="${accent}" stroke-width="2" opacity="0.42"/>
        <circle cx="${cx}" cy="${cy + h * 0.06}" r="${Math.round(r * 0.5)}" fill="${accent}" opacity="0.3"/>`;
  }
}

export function artworkSvg(spec: ArtworkSpec): string {
  const hash = hashString(spec.seed);
  const palette = PALETTES[hash % PALETTES.length]!;
  const composition = spec.composition ?? 'poster';
  const w = spec.width;
  const h = spec.height;
  const isWide = composition === 'backdrop';
  const fontSize = isWide ? Math.round(h * 0.1) : Math.round(w * 0.115);
  const titleY = isWide ? Math.round(h * 0.76) : Math.round(h * 0.84);
  const x = Math.round(w * 0.08);
  const title = escapeXml(spec.title);
  const sub = escapeXml(spec.subtitle ?? '');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${palette.base}"/>
      <stop offset="1" stop-color="${palette.deep}"/>
    </linearGradient>
    <radialGradient id="halo" cx="32%" cy="30%" r="72%">
      <stop offset="0" stop-color="${palette.glow}" stop-opacity="0.72"/>
      <stop offset="1" stop-color="${palette.deep}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="scrim" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0.42" stop-color="#05070A" stop-opacity="0"/>
      <stop offset="1" stop-color="#05070A" stop-opacity="0.88"/>
    </linearGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#bg)"/>
  <rect width="${w}" height="${h}" fill="url(#halo)"/>
  ${motif(hash >> 3, w, h, palette.accent, palette.glow)}
  <rect width="${w}" height="${h}" fill="url(#scrim)"/>
  <rect x="${x}" y="${titleY - fontSize - Math.round(h * 0.02)}" width="${Math.round(w * 0.14)}" height="3" rx="1.5" fill="${palette.accent}" opacity="0.9"/>
  ${spec.showTitle ? `<text x="${x}" y="${titleY}" fill="#F2EFE9" font-family="MiSans, 'PingFang SC', 'Microsoft YaHei', sans-serif" font-size="${fontSize}" font-weight="600" letter-spacing="2">${title}</text>` : ''}
  ${spec.showTitle && sub ? `<text x="${x}" y="${titleY + Math.round(fontSize * 0.7)}" fill="#F2EFE9" opacity="0.62" font-family="'Segoe UI', MiSans, sans-serif" font-size="${Math.round(fontSize * 0.36)}" letter-spacing="4">${sub}</text>` : ''}
</svg>`;
}

export function artworkDataUri(spec: ArtworkSpec): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(artworkSvg(spec))}`;
}

const SIZE_MAP: Record<ArtworkRequest['size'], number> = {
  sm: 160,
  md: 320,
  lg: 640,
  xl: 1280,
};

/** 极简内存 Artwork Cache：按 (mediaId, kind, size) 缓存，支持重建 */
const cache = new Map<string, string>();

export function cacheKey(req: ArtworkRequest): string {
  return `${req.mediaId}:${req.kind}:${req.size}`;
}

export function getArtwork(req: ArtworkRequest, resolve: (r: ArtworkRequest) => string): string {
  const key = cacheKey(req);
  const hit = cache.get(key);
  if (hit) return hit;
  const value = resolve(req);
  cache.set(key, value);
  return value;
}

export function rebuildArtworkCache(): void {
  cache.clear();
}

export function artworkCacheSize(): number {
  return cache.size;
}

/** 由 ArtworkRequest 生成尺寸信息 */
export function artworkDimensions(req: ArtworkRequest): { width: number; height: number; composition: ArtworkSpec['composition'] } {
  const base = SIZE_MAP[req.size];
  if (req.kind === 'backdrop') return { width: Math.round(base * 1.78), height: base, composition: 'backdrop' };
  if (req.kind === 'thumbnail') return { width: base, height: Math.round(base * 0.62), composition: 'backdrop' };
  return { width: Math.round(base * 0.667), height: base, composition: 'poster' };
}
