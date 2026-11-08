import type { MediaId } from '@yingmu/media-models';

/**
 * 磁贴布局不变量检查（任务书 8：严谨化零重叠与边界验证）。
 *
 * 抽成库模块而不是留在测试文件里，原因有二：
 *  1. 注入式测试（0.1px / 0.5px / 1px 重叠、越界、NaN、Infinity）需要直接
 *     调用检测器本身；
 *  2. 检测器是「验收标准」，必须是产品代码而不是测试私有实现。
 *
 * 浮点精度约定（任务书 8.1）：
 *  - 重叠判定：交叠深度 > EPSILON 才算重叠。边缘精确接触（交叠 = 0）与
 *    浮点噪声（≤ 0.01px）都不算；0.1px / 0.5px / 1px 的真实重叠必须检出。
 *  - 边界判定：同样用 EPSILON——越界 0.5px / 1px 都是不合格，不允许
 *    「1px 误差以内算通过」。
 */

/** 数值精度阈值：小于它的交叠/越界视为浮点噪声 */
export const OVERLAP_EPSILON = 0.01;

export interface LayoutBox {
  mediaId: MediaId;
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Sweep Line 重叠检测：按 x 排序扫描，只比较 x 区间相交的磁贴对，
 * 复杂度远低于 O(n²) 全量两两比较；y 向交叠用同一 EPSILON 严格判定。
 */
export function sweepOverlaps(boxes: readonly LayoutBox[]): Array<[MediaId, MediaId]> {
  type Event = { x: number; kind: 0 | 1; box: LayoutBox };
  const events: Event[] = [];
  for (const b of boxes) {
    events.push({ x: b.x, kind: 0, box: b });
    events.push({ x: b.x + b.width, kind: 1, box: b });
  }
  events.sort((p, q) => (p.x !== q.x ? p.x - q.x : p.kind - q.kind));

  const active: LayoutBox[] = [];
  const found: Array<[MediaId, MediaId]> = [];
  for (const ev of events) {
    if (ev.kind === 1) {
      const idx = active.indexOf(ev.box);
      if (idx >= 0) active.splice(idx, 1);
      continue;
    }
    for (const other of active) {
      const overlapX =
        Math.min(other.x + other.width, ev.box.x + ev.box.width) - Math.max(other.x, ev.box.x);
      const overlapY =
        Math.min(other.y + other.height, ev.box.y + ev.box.height) - Math.max(other.y, ev.box.y);
      if (overlapX > OVERLAP_EPSILON && overlapY > OVERLAP_EPSILON) {
        found.push([other.mediaId, ev.box.mediaId]);
      }
    }
    active.push(ev.box);
  }
  return found;
}

export interface InvariantReport {
  problems: string[];
  /** Sweep Line 检出的重叠对数 */
  overlapPairs: number;
  /** 重叠检测耗时（ms，真实测量） */
  overlapCheckMs: number;
  tiles: number;
}

/**
 * 完整不变量检查：无重复 ID、坐标非负、尺寸为正有限值、
 * 不超出画布左右与底部、任意两磁贴零重叠。
 * `canvasWidth` / `canvasHeight` 来自布局结果，不是外部假设。
 */
export function checkMosaicInvariants(
  tiles: readonly LayoutBox[],
  canvasWidth: number,
  canvasHeight: number,
): InvariantReport {
  const problems: string[] = [];
  const eps = OVERLAP_EPSILON;
  const seen = new Set<MediaId>();

  for (const t of tiles) {
    if (seen.has(t.mediaId)) problems.push(`${t.mediaId}: 重复 Media ID`);
    seen.add(t.mediaId);

    if (
      !Number.isFinite(t.x) ||
      !Number.isFinite(t.y) ||
      !Number.isFinite(t.width) ||
      !Number.isFinite(t.height)
    ) {
      problems.push(`${t.mediaId}: 坐标或尺寸不是有限值（x=${t.x} y=${t.y} w=${t.width} h=${t.height}）`);
      continue;
    }
    if (t.width <= 0 || t.height <= 0) {
      problems.push(`${t.mediaId}: 尺寸必须为正（w=${t.width} h=${t.height}）`);
      continue;
    }
    if (t.x < -eps) problems.push(`${t.mediaId}: 越出左边界 ${t.x.toFixed(3)}px`);
    if (t.y < -eps) problems.push(`${t.mediaId}: 越出上边界 ${t.y.toFixed(3)}px`);
    if (t.x + t.width > canvasWidth + eps) {
      problems.push(`${t.mediaId}: 越出右边界 ${(t.x + t.width - canvasWidth).toFixed(3)}px`);
    }
    if (t.y + t.height > canvasHeight + eps) {
      problems.push(`${t.mediaId}: 越出底部 ${(t.y + t.height - canvasHeight).toFixed(3)}px`);
    }
  }

  const started = performance.now();
  const overlaps = sweepOverlaps(tiles);
  const overlapCheckMs = performance.now() - started;
  for (const [a, b] of overlaps.slice(0, 10)) problems.push(`${a} 与 ${b} 重叠`);

  return {
    problems,
    overlapPairs: overlaps.length,
    overlapCheckMs,
    tiles: tiles.length,
  };
}
