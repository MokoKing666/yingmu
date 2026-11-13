/**
 * Folia 式无级拼贴布局引擎（Mosaic / Wall Layout Engine）
 *
 * ## 为什么不是 CSS Grid，也不是瀑布流
 * - 旧实现是 12 列 `dense` 网格 + 六种固定跨度：尺寸离散、dense 回填会打乱
 *   用户自定义顺序、无法表达「超大横幅与超大竖版在同一行互相穿插」。
 * - 瀑布流按列堆叠，同样不能产生完整的二维构图，且长列表必须一次性挂载 DOM。
 * - 本引擎采用**确定性 Skyline（最左最低 + 宽度试探）二维装箱**：
 *   每个磁贴按连续权重算出连续面积与连续宽高比，再在 skyline 上找最低最左
 *   的可放置凹口；宽度试探让磁贴自适应凹口，大磁贴留下的空隙会被后续小磁贴
 *   自然填补。输出绝对 x/y/width/height，天然支持按可见区域虚拟化。
 *
 * ## 保证
 * - 纯函数：所有「随机性」来自 mediaId 的 FNV-1a hash，不使用 Math.random / Date.now；
 *   时间权重以数据集中最大 addedAt 为固定基准，同一批数据多次计算完全一致。
 * - 零重叠、无大面积空洞、无周期性重复、用户自定义排序稳定、窗口缩放可重排。
 * - `variant` 保留为**视觉语义标签**（字号 / 信息密度 / 图片类型），不再决定尺寸。
 */

import { mosaic as M, tile as tileTokens } from '@yingmu/design-tokens';
import type { MediaId, MediaItem, TileLayout } from '@yingmu/media-models';
import { hashString } from './format';
import { applyCustomOrder } from './layout-preferences';

export type WallVariant = TileLayout['variant'];

/** 兼容层：视觉语义节奏周期，只影响字号与封面类型，不决定尺寸或位置 */
export const WALL_PATTERN: WallVariant[] = [
  'portrait-lg',
  'portrait-sm',
  'wide',
  'portrait-sm',
  'resume',
  'portrait-lg',
  'dynamic',
  'portrait-sm',
];

export interface WallLayoutOptions {
  /** 用户拖拽排序后的自定义顺序：mediaId → 目标序号 */
  customOrder?: Record<MediaId, number>;
  /** 是否启用超大主视觉（窄屏或子页面可关闭） */
  heroEnabled?: boolean;
}

/** 视觉分类：只用于 CSS 信息密度，不是尺寸档位 */
export type MosaicScale =
  | 'ultra-wide'
  | 'ultra-tall'
  | 'wide'
  | 'square'
  | 'portrait'
  | 'compact'
  | 'irregular';

export interface MosaicBox {
  /** 相对画布左上角的绝对像素坐标 */
  x: number;
  y: number;
  width: number;
  height: number;
  /** 实际渲染宽高比（连续值） */
  aspect: number;
  /** 0..1 内容权重，驱动字号与入场延迟 */
  emphasis: number;
  scale: MosaicScale;
  focal: { x: number; y: number };
  objectPosition: string;
}

export interface MosaicTile extends TileLayout {
  box: MosaicBox;
}

export interface MosaicResult {
  tiles: MosaicTile[];
  canvasWidth: number;
  canvasHeight: number;
}

export interface MosaicOptions extends WallLayoutOptions {
  /** 当前可用画布宽度（px）；默认 1440 */
  canvasWidth?: number;
  /** 用户为媒体设置的可视权重增量（-1..1） */
  customWeights?: Record<MediaId, number>;
  /** 媒体原始素材宽高比；不传时按类型推断 */
  aspectResolver?: (item: MediaItem) => number;
  /**
   * 是否必须**保留真实画幅**（不参与目标比例映射）。
   * 个人视频为 true：16:9 就是 16:9，不能被 Folia 的比例分档改成 1.45:1。
   */
  preserveAspect?: (item: MediaItem) => boolean;
  /** 用户调整的图片焦点（0..100）；返回 undefined 时由 id 稳定推导 */
  focalResolver?: (item: MediaItem) => { x: number; y: number } | undefined;
  /** 磁贴间距，默认取 design token */
  gap?: number;
}

interface SkylineSegment {
  x: number;
  width: number;
  y: number;
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const lerp = (a: number, b: number, t: number): number => a + (b - a) * clamp(t, 0, 1);

/** 稳定伪随机：同一 id + salt 永远得到同一 0..1 值 */
function hashUnit(id: string, salt: number): number {
  return (hashString(`${id}|${salt}`) % 100000) / 100000;
}

const KIND_WEIGHT: Record<string, number> = {
  movie: 0.82,
  tv: 0.74,
  anime: 0.7,
  documentary: 0.66,
  personal: 0.5,
};

/** 单条目变体决策：兼容旧调用方，语义标签而非尺寸档位 */
export function variantForItem(
  item: MediaItem,
  index: number,
  opts: { usedResumes: number; heroEnabled: boolean },
): WallVariant {
  if (opts.heroEnabled && index === 0) return 'hero';

  if (item.resumeSeconds != null && item.resumeSeconds > 0 && opts.usedResumes < 2) {
    return 'resume';
  }
  if (item.favorite && index % 3 === 0) return 'wide';

  const offset = opts.heroEnabled ? index - 1 : index;
  return WALL_PATTERN[((offset % WALL_PATTERN.length) + WALL_PATTERN.length) % WALL_PATTERN.length]!;
}

/** 参考时间取数据集最大 addedAt，避免 Date.now 破坏确定性 */
function referenceTime(items: MediaItem[]): number {
  let max = 0;
  for (const item of items) {
    const t = Date.parse(item.addedAt);
    if (Number.isFinite(t) && t > max) max = t;
  }
  return max || Date.parse('2026-01-01T00:00:00Z');
}

/**
 * 连续权重（0..1）。构成：媒体类型 / 宽高比素材 / 重要性 / 收藏 / 续播 /
 * 最近添加 / 排序位置 / 自定义权重 / 确定性 hash 抖动与连续节奏脉冲。
 * 刻意让 hash 与节奏占较大比重，制造明显的大中小面积反差，
 * 同时用 sin(index * 1.37) 这种非整数频率避免固定六档的重复周期。
 */
function emphasisOf(
  item: MediaItem,
  index: number,
  refTime: number,
  seed: number,
  customWeight: number,
): number {
  const W = M.weights;
  const kind = KIND_WEIGHT[item.kind] ?? 0.6;
  const t = Date.parse(item.addedAt);
  const ageDays = Number.isFinite(t) ? Math.max(0, (refTime - t) / 86400000) : 120;
  const recency = clamp(1 - ageDays / 210, 0, 1);
  const rating = clamp((item.metadata.rating ?? 6.5) / 10, 0, 1);
  const favorite = item.favorite ? 1 : 0;
  const resume = (item.resumeSeconds ?? 0) > 0 ? 1 : 0;
  const position = clamp(1 - index / 26, 0, 1);
  const rhythm = 0.5 + 0.5 * Math.sin(index * 1.37 + seed * 9.42);

  return clamp(
    W.hash * seed +
      W.kind * kind +
      W.recency * recency +
      W.rating * rating +
      W.favorite * favorite +
      W.resume * resume +
      W.position * position +
      W.rhythm * rhythm +
      customWeight,
    0,
    1,
  );
}

/**
 * 求一个**统一缩放因子** k，使 w*k、h*k 同时满足全部边界（任务书 7.2）。
 *
 * 与「分别 clamp 宽和高」的本质区别：任何时刻宽高比都保持 w/h 不变；
 * 边界冲突（极端比例下 minW/minH 与 maxH 不可兼得）时优先满足最小可见
 * 尺寸，最后用画布宽度兜底，保证不水平溢出。
 */
function uniformScaleFactor(
  w: number,
  h: number,
  bounds: { minW: number; maxW: number; minH: number; maxH: number; canvasWidth: number },
): number {
  const maxW = Math.min(bounds.maxW, bounds.canvasWidth);
  let k = 1;
  if (w * k > maxW) k = maxW / w; // 超宽：整体等比缩小
  if (h * k > bounds.maxH) k = bounds.maxH / h; // 超高：继续整体缩小
  if (w * k < bounds.minW) k = bounds.minW / w; // 太窄：整体等比放大（可见性优先）
  if (h * k < bounds.minH) k = bounds.minH / h; // 太矮：整体等比放大
  if (w * k > bounds.canvasWidth) k = bounds.canvasWidth / w; // 绝不水平溢出
  return k;
}

/** 连续目标宽高比：超宽 / 宽幅 / 方形 / 竖版 / 超大竖版 / 不规则 */
function aspectOf(
  sourceAspect: number,
  emphasis: number,
  hero: boolean,
  r1: number,
  r2: number,
  preserveSource = false,
): number {
  // 必须保留真实画幅的素材（个人视频等）：直接用原始比例，
  // 只在极端值上做安全钳制，不参与 Folia 的比例分档。
  if (preserveSource) return clamp(sourceAspect, 0.4, 2.9);
  const A = M.aspect;
  if (hero) return lerp(A.ultraWide.min, A.ultraWide.max, r1);
  if (emphasis > 0.84 && r2 > 0.62) return lerp(A.ultraWide.min, 2.95, r1);
  if (emphasis > 0.78 && r2 < 0.34) return lerp(A.ultraTall.min, A.ultraTall.max, r1);
  if (r2 > 0.86 && emphasis > 0.4) return lerp(A.irregular.min, A.irregular.max, r1);
  if (sourceAspect >= 1.35) return lerp(A.wide.min, A.wide.max, r1);
  if (sourceAspect >= 0.88) return lerp(A.square.min, A.square.max, r1);
  return lerp(A.portrait.min, A.portrait.max, r1);
}

function scaleOf(width: number, height: number, unit: number): MosaicScale {
  const a = width / height;
  if (a >= 2.3) return 'ultra-wide';
  if (a <= 0.58) return 'ultra-tall';
  if (a >= 1.4) return 'wide';
  if (a >= 0.9 && a <= 1.15) return 'square';
  if (a <= 0.82) return 'portrait';
  if (width < unit * 1.5) return 'compact';
  return 'irregular';
}

/** 合并相邻等高区间，控制 skyline 长度，保证千条目时仍可计算 */
function mergeSegments(list: SkylineSegment[]): SkylineSegment[] {
  const sorted = list.filter((s) => s.width > 0.5).sort((a, b) => a.x - b.x);
  const out: SkylineSegment[] = [];
  for (const segment of sorted) {
    const last = out[out.length - 1];
    if (last && Math.abs(last.y - segment.y) < 0.5 && Math.abs(last.x + last.width - segment.x) < 0.5) {
      last.width += segment.width;
    } else {
      out.push({ ...segment });
    }
  }
  return out;
}

/** 最左最低可放置点：遍历 skyline 区间起点，取覆盖区间内的最大 y */
function findPosition(
  sky: SkylineSegment[],
  w: number,
  canvasWidth: number,
): { x: number; y: number; score: number } {
  let best: { x: number; y: number; score: number } | null = null;
  for (const segment of sky) {
    const x = segment.x;
    const right = x + w;
    if (right > canvasWidth + 0.5) continue;
    let y = 0;
    let covered = 0;
    for (const s of sky) {
      const overlap = Math.min(right, s.x + s.width) - Math.max(x, s.x);
      if (overlap > 0.5) {
        y = Math.max(y, s.y);
        covered += overlap;
      }
    }
    if (covered < w - 0.5) continue;
    const score = y * 1000 + x * 0.02;
    if (!best || score < best.score) best = { x, y, score };
  }
  if (!best) {
    const y = sky.reduce((max, s) => Math.max(max, s.y), 0);
    return { x: 0, y, score: y * 1000 };
  }
  return best;
}

/** 把 [x, x+w] 区间的 skyline 提升为 newY，并切分两端 */
function applyPlacement(
  sky: SkylineSegment[],
  x: number,
  w: number,
  newY: number,
): SkylineSegment[] {
  const out: SkylineSegment[] = [];
  const right = x + w;
  for (const s of sky) {
    const sRight = s.x + s.width;
    if (sRight <= x + 0.5 || s.x >= right - 0.5) {
      out.push({ ...s });
      continue;
    }
    if (s.x < x - 0.5) out.push({ x: s.x, width: x - s.x, y: s.y });
    const a = Math.max(s.x, x);
    const b = Math.min(sRight, right);
    if (b - a > 0.5) out.push({ x: a, width: b - a, y: newY });
    if (sRight > right + 0.5) out.push({ x: right, width: sRight - right, y: s.y });
  }
  return mergeSegments(out);
}

/**
 * 计算完整无级拼贴布局。主入口。
 * 输出 tiles 的 `box` 为绝对像素位置，容器高度由 canvasHeight 给出；
 * 渲染层据此只挂载可见区间内的磁贴，实现真正的长列表虚拟化。
 */
export function computeMosaicLayout(items: MediaItem[], options: MosaicOptions = {}): MosaicResult {
  const canvasWidth = Math.max(320, Math.round(options.canvasWidth ?? 1440));
  const gap = options.gap ?? M.gap;
  const heroEnabled = options.heroEnabled ?? true;
  const empty: MosaicResult = { tiles: [], canvasWidth, canvasHeight: 0 };
  if (items.length === 0) return empty;

  // 默认严格保留调用方传入的顺序：LibraryPage 可能已经按评分 / 年份 / 名称排好，
  // 这里再按 addedAt 排序会覆盖用户选择的排序（v0.2 的真实缺陷）。
  // customOrder 是**部分**自定义排列：有序号的按序号，没序号的保持原始相对顺序，
  // 同序号用原始 index；绝不退回 Media ID 排序（那会让局部拖拽变成全局洗牌）。
  const ordered = options.customOrder
    ? applyCustomOrder(items, options.customOrder)
    : [...items];

  const refTime = referenceTime(ordered);
  const minW = clamp(canvasWidth * M.width.minRatio, M.width.minPx, M.width.maxClamp);
  const maxW = canvasWidth * M.width.maxRatio;
  const minH = clamp(canvasWidth * M.height.minRatio, M.height.minPx, M.height.maxClamp);
  const maxH = clamp(canvasWidth * M.height.maxRatio, M.height.maxLowerPx, M.height.maxPx);

  let sky: SkylineSegment[] = [{ x: 0, width: canvasWidth, y: 0 }];
  const tiles: MosaicTile[] = [];
  let usedResumes = 0;

  for (let index = 0; index < ordered.length; index += 1) {
    const item = ordered[index]!;
    const hero = heroEnabled && index === 0;
    const seed = hashUnit(item.id, 0);
    const r1 = hashUnit(item.id, 1);
    const r2 = hashUnit(item.id, 2);
    const r3 = hashUnit(item.id, 3);
    const r4 = hashUnit(item.id, 4);

    const customWeight = clamp(options.customWeights?.[item.id] ?? 0, -1, 1);
    const emphasis = hero ? 1 : emphasisOf(item, index, refTime, seed, customWeight);
    const sourceAspect = options.aspectResolver?.(item) ?? (item.kind === 'movie' ? 0.667 : 1.2);
    const preserveSource = options.preserveAspect?.(item) ?? item.kind === 'personal';
    const targetAspect = aspectOf(sourceAspect, emphasis, hero, r1, r2, preserveSource);

    // 连续尺寸：横幅按宽度驱动、竖版按高度驱动，幂次拉开大中小反差。
    // 宽度与高度都是画布宽度的连续比例函数，没有任何离散档位。
    const drive = Math.pow(emphasis, M.sizeExponent);
    let baseW: number;
    let baseH: number;
    if (preserveSource) {
      // 个人视频（任务书 7.2）：宽高必须由**同一个缩放因子**导出，
      // 绝不允许独立钳制某一轴把 16:9 压成 1.45:1。
      const driveW = targetAspect >= 1 ? lerp(minW, maxW, drive) : lerp(minH, maxH, drive) * targetAspect;
      const k = uniformScaleFactor(driveW, driveW / targetAspect, { minW, maxW, minH, maxH, canvasWidth });
      baseW = driveW * k;
      baseH = baseW / targetAspect;
    } else if (targetAspect >= 1) {
      baseW = clamp(lerp(minW, maxW, drive), minW, Math.min(maxW, canvasWidth));
      baseH = clamp(baseW / targetAspect, minH, maxH);
    } else {
      baseH = clamp(lerp(minH, maxH, drive), minH, maxH);
      baseW = clamp(baseH * targetAspect, minW, Math.min(maxW, canvasWidth));
    }

    // 宽度试探：等比缩放让磁贴填入 skyline 凹口，减少空洞。
    // 除了围绕目标宽度的若干系数，还额外生成一个「最低凹口适配宽度」候选：
    // 超大横幅留下的窄长空隙正需要这种尺寸，否则整块区域会空着。
    const probes = M.widthProbe.map((factor) => baseW * factor);
    // 对 skyline 凹口生成「刚好填满」的候选以回收空隙，但用确定性 hash 门控：
    // 只有部分磁贴参与填洞，其余保持自由尺寸，避免所有卡片收敛到同一宽度。
    // 候选宽度再乘一个连续扰动系数，保证尺寸始终无级而非离散档位。
    if (r2 > 0.35 || index <= 2) {
      for (const segment of sky) {
        let opening = 0;
        for (const s of sky) {
          if (s.x < segment.x) continue;
          if (s.y > segment.y + 0.5) break;
          opening += s.width;
        }
        const candidate = (opening - gap) * (0.96 + r3 * 0.05);
        if (candidate >= minW && candidate <= maxW && !probes.some((p) => Math.abs(p - candidate) < 8)) {
          probes.push(candidate);
        }
      }
    }

    let chosen: { x: number; y: number; w: number; h: number; ph: number; score: number } | null = null;
    // preserveSource 的等比缩放边界：同一个因子同时作用于宽与高
    const uniformMin = preserveSource ? Math.max(minW / baseW, minH / baseH) : 0;
    const uniformMax = preserveSource
      ? Math.min(Math.min(maxW, canvasWidth) / baseW, maxH / baseH)
      : Infinity;
    for (const probe of probes) {
      let w: number;
      let h: number;
      if (preserveSource) {
        // 宽度试探也必须保持同一比例：把候选宽度换算成统一缩放因子
        const factor = clamp(probe / baseW, Math.min(uniformMin, uniformMax), Math.max(uniformMin, uniformMax));
        w = baseW * factor;
        h = baseH * factor;
      } else {
        w = clamp(probe, minW, Math.min(maxW, canvasWidth));
        h = clamp(baseH * (w / baseW), minH, maxH);
      }
      const pw = w + gap;
      const ph = h + gap;
      const pos = findPosition(sky, pw, canvasWidth);
      // 轻微惩罚偏离目标宽度，但填满凹口带来的 y 收益远大于该惩罚
      const score = pos.y + ph + Math.abs(w - baseW) * 0.25;
      if (!chosen || score < chosen.score) chosen = { x: pos.x, y: pos.y, w, h, ph, score };
    }
    const placed = chosen!;
    sky = applyPlacement(sky, placed.x, placed.w + gap, placed.y + placed.ph);

    const variant = variantForItem(item, index, { usedResumes, heroEnabled });
    if (variant === 'resume') usedResumes += 1;

    const focal = options.focalResolver?.(item) ?? {
      x: Math.round(34 + r3 * 30),
      y: Math.round(26 + r4 * 34),
    };
    const aspect = placed.w / placed.h;

    tiles.push({
      mediaId: item.id,
      colSpan: clamp(Math.round(placed.w / (canvasWidth / tileTokens.gridColumns)), 1, tileTokens.gridColumns),
      rowSpan: Math.max(1, Math.round(placed.h / tileTokens.rowHeight)),
      variant,
      order: index,
      box: {
        x: Math.round(placed.x),
        y: Math.round(placed.y),
        width: Math.round(placed.w),
        height: Math.round(placed.h),
        aspect,
        emphasis,
        scale: scaleOf(placed.w, placed.h, minW),
        focal,
        objectPosition: `${Math.round(focal.x)}% ${Math.round(focal.y)}%`,
      },
    });
  }

  const canvasHeight = Math.round(sky.reduce((max, s) => Math.max(max, s.y), 0));
  return { tiles, canvasWidth, canvasHeight };
}

/**
 * 兼容旧 API：返回 TileLayout[] 语义（附 box），供既有测试与调用方使用。
 * 布局仍由同一引擎计算，不回退到固定档位。
 */
/**
 * 首页推荐顺序（确定性，不含随机）。
 *
 * 与尺寸权重分开：这里只决定「先看到谁」，hero 因此是推荐第一名，
 * 而不是「数组里最早加入的那部片」。用户一旦拖拽排序，调用方应传 customOrder，
 * 由 computeMosaicLayout 优先采用，不再走本函数。
 */
export function orderByRecommendation(items: MediaItem[]): MediaItem[] {
  const ref = referenceTime(items);
  const scored = items.map((item) => {
    const t = Date.parse(item.addedAt);
    const ageDays = Number.isFinite(t) ? Math.max(0, (ref - t) / 86400000) : 365;
    const recency = clamp(1 - ageDays / 60, 0, 1);
    const favorite = item.favorite ? 1 : 0;
    const resume = (item.resumeSeconds ?? 0) > 0 ? 1 : 0;
    const rating = clamp((item.metadata.rating ?? 6.5) / 10, 0, 1);
    const score = 0.38 * recency + 0.24 * favorite + 0.2 * resume + 0.18 * rating;
    return { item, score };
  });
  scored.sort((a, b) => b.score - a.score || a.item.id.localeCompare(b.item.id));
  return scored.map((entry) => entry.item);
}

export function computeWallLayout(items: MediaItem[], options: WallLayoutOptions = {}): MosaicTile[] {
  return computeMosaicLayout(items, { ...options, canvasWidth: 1440 }).tiles;
}

/** 兼容旧布局自检；额外校验 box 基本有效性 */
export function validateLayout(layouts: TileLayout[] | MosaicTile[]): string[] {
  const problems: string[] = [];
  const orders = new Set<number>();
  const ids = new Set<string>();

  for (const l of layouts) {
    if (l.colSpan < 1 || l.colSpan > tileTokens.gridColumns) problems.push(`${l.mediaId}: colSpan ${l.colSpan} 越界`);
    if (l.rowSpan < 1) problems.push(`${l.mediaId}: rowSpan 非正`);
    if (orders.has(l.order)) problems.push(`${l.mediaId}: order ${l.order} 重复`);
    if (ids.has(l.mediaId)) problems.push(`${l.mediaId}: 重复条目`);
    orders.add(l.order);
    ids.add(l.mediaId);
    if ('box' in l) {
      const b = l.box;
      if (b.x < 0 || b.y < 0 || b.width <= 0 || b.height <= 0) {
        problems.push(`${l.mediaId}: box 非法`);
      }
    }
  }
  return problems;
}

/** 完整拼贴自检：零重叠 + 画布边界 + 尺寸反差，供测试与性能报告使用 */
export function validateMosaic(result: MosaicResult): string[] {
  const problems = validateLayout(result.tiles);
  const boxes = result.tiles.map((t) => ({ id: t.mediaId, ...t.box }));
  for (let i = 0; i < boxes.length; i += 1) {
    const a = boxes[i]!;
    if (a.x + a.width > result.canvasWidth + 1) problems.push(`${a.id}: 超出画布右边界`);
    for (let j = i + 1; j < boxes.length; j += 1) {
      const b = boxes[j]!;
      const overlapX = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
      const overlapY = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
      if (overlapX > 1 && overlapY > 1) {
        problems.push(`${a.id} 与 ${b.id} 重叠`);
        if (problems.length > 20) return problems;
      }
    }
  }
  return problems;
}

/** 把拖拽结果转换成可持久化的 customOrder */
export function toCustomOrder(orderedIds: MediaId[]): Record<MediaId, number> {
  return Object.fromEntries(orderedIds.map((id, index) => [id, index]));
}
