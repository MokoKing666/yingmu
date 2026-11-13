/**
 * 影幕 YingMu — 真实静态演示素材索引
 *
 * apps/desktop/public/artwork/ 下的 48 张 SVG 由 scripts/generate-demo-artwork.mjs
 * 程序化生成，均为原创电影 / 摄影场景插画（非圆环 / 条纹 / 抽象几何占位图）。
 * 本模块提供确定性查询 API：任意 mediaId（包括压力测试合成出的 id）都会稳定
 * 映射到一张真实存在的素材，绝不返回 undefined。
 *
 * 家族定义（比例 + 分类 + 数量）必须与生成脚本的 FAMILIES 完全一致，
 * 这样由本模块拼出的文件名才一定对应 public/artwork/ 里真实的文件。
 *
 * 一致性约束：同一 mediaId 恒定落在同一个「家族」内，家族内所有素材共享
 * 相同的宽高比与分类，因此 demoArtworkAspect(mediaId) 与任一 kind 下
 * demoArtworkUrl 返回的 SVG viewBox 宽高比始终一致。
 */

export type DemoArtworkKind = 'poster' | 'backdrop' | 'thumbnail';

export type DemoArtworkCategory =
  | 'cinematic-poster'
  | 'widescreen-still'
  | 'animation'
  | 'documentary'
  | 'personal'
  | 'square'
  | 'irregular';

type CategoryTag = 'cp' | 'ws' | 'an' | 'dc' | 'pv' | 'sq' | 'ir';

interface ArtworkFamily {
  /** 文件名里使用的比例标签，与生成脚本一致 */
  ratio: string;
  /** 宽高比分子 / 分母 */
  n: number;
  d: number;
  cat: CategoryTag;
  count: number;
}

/** 与 scripts/generate-demo-artwork.mjs 的 FAMILIES 逐项对应，顺序不可改 */
const FAMILIES: readonly ArtworkFamily[] = [
  { ratio: '2x3', n: 2, d: 3, cat: 'cp', count: 8 },
  { ratio: '16x9', n: 16, d: 9, cat: 'ws', count: 8 },
  { ratio: '4x3', n: 4, d: 3, cat: 'dc', count: 6 },
  { ratio: '2x3', n: 2, d: 3, cat: 'an', count: 6 },
  { ratio: '1x1', n: 1, d: 1, cat: 'pv', count: 6 },
  { ratio: '5x4', n: 5, d: 4, cat: 'sq', count: 5 },
  { ratio: '4x5', n: 4, d: 5, cat: 'ir', count: 5 },
  { ratio: '3x2', n: 3, d: 2, cat: 'ir', count: 4 },
];

interface ArtworkAsset {
  /** 不含扩展名的文件名，如 ym-01-2x3-cp */
  file: string;
  family: number;
}

function buildAssets(): ArtworkAsset[] {
  const assets: ArtworkAsset[] = [];
  let index = 0;
  for (let fi = 0; fi < FAMILIES.length; fi += 1) {
    const family = FAMILIES[fi]!;
    for (let j = 0; j < family.count; j += 1) {
      index += 1;
      assets.push({
        file: `ym-${String(index).padStart(2, '0')}-${family.ratio}-${family.cat}`,
        family: fi,
      });
    }
  }
  return assets;
}

const ASSETS: readonly ArtworkAsset[] = buildAssets();

/** 实际生成的素材数量（>= 48） */
export const DEMO_ARTWORK_COUNT: number = ASSETS.length;

/** 每个家族对应的素材下标，供按 kind 选取同家族内不同场景 */
const GROUPS: readonly number[][] = (() => {
  const groups: number[][] = FAMILIES.map(() => []);
  ASSETS.forEach((asset, i) => {
    groups[asset.family]!.push(i);
  });
  return groups;
})();

/** FNV-1a 32 位确定性哈希（与 lib/format.ts 的 hashString 同算法） */
function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** 家族只由 mediaId 决定，保证同一 id 的宽高比 / 分类恒定 */
function familyIndex(mediaId: string): number {
  return fnv1a(mediaId) % FAMILIES.length;
}

/**
 * 在所属家族内，用 (mediaId, kind) 选一张具体素材。
 * 家族内素材数量恒 >= 4，group 必非空，取模结果必为合法下标。
 */
function assetIndex(mediaId: string, kind: DemoArtworkKind): number {
  const group = GROUPS[familyIndex(mediaId)]!;
  const hash = fnv1a(`${mediaId}\u0000${kind}`);
  return group[hash % group.length]!;
}

/** 返回 Vite 可直接服务的 /artwork/<文件名>.svg 静态素材路径 */
export function demoArtworkUrl(mediaId: string, kind: DemoArtworkKind): string {
  return `/artwork/${ASSETS[assetIndex(mediaId, kind)]!.file}.svg`;
}

/** 返回 0..100 的百分比，用于 CSS object-position 焦点 */
export function demoArtworkFocal(mediaId: string, kind: DemoArtworkKind): { x: number; y: number } {
  const hash = fnv1a(`${mediaId}\u0000${kind}\u0000focal`);
  return {
    x: 28 + (hash % 45),
    y: 24 + ((hash >>> 9) % 53),
  };
}

/** 返回该素材原始宽高比（width / height），与 SVG viewBox 一致 */
export function demoArtworkAspect(mediaId: string): number {
  const family = FAMILIES[familyIndex(mediaId)]!;
  return family.n / family.d;
}

const CATEGORY_LABEL: Record<CategoryTag, DemoArtworkCategory> = {
  cp: 'cinematic-poster',
  ws: 'widescreen-still',
  an: 'animation',
  dc: 'documentary',
  pv: 'personal',
  sq: 'square',
  ir: 'irregular',
};

/** 返回素材分类，供 UI 徽标 / 归档说明使用 */
export function demoArtworkCategory(
  mediaId: string,
): 'cinematic-poster' | 'widescreen-still' | 'animation' | 'documentary' | 'personal' | 'square' | 'irregular' {
  return CATEGORY_LABEL[FAMILIES[familyIndex(mediaId)]!.cat];
}
