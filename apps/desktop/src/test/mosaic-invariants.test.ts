/**
 * 1000 条布局的完整不变量验证（任务书 6.x）。
 *
 * 之前的压力测试只断言「布局完成且耗时正常」，1000 条并没有跑完整的
 * 零重叠 / 边界检查；这里补齐：
 *  - 无重复 Media ID、坐标非负、尺寸为正有限值；
 *  - 不超出画布左右与底部；
 *  - **任意两个磁贴不重叠**（Sweep Line 全量检查，不抽查）；
 *  - 自定义顺序不被破坏、连续尺寸仍然成立。
 *
 * 性能数据（布局耗时 / 重叠检测耗时 / 中位数 / P95）以 console.warn 输出，
 * 供 docs/testing/performance-report.md 引用；**不宣称任何 FPS**。
 */
import { describe, it, expect } from 'vitest';
import { computeMosaicLayout, validateMosaic } from '@/lib/wall-layout';
import { buildDemoLibrary } from '@/lib/demo-data';
import type { MediaItem } from '@yingmu/media-models';

const seedItems = buildDemoLibrary();

/** 复制演示条目生成唯一 Media ID 的压力数据 */
function stress(n: number): MediaItem[] {
  return Array.from({ length: n }, (_, i) => {
    const base = seedItems[i % seedItems.length]!;
    return {
      ...base,
      id: `stress-${String(i).padStart(5, '0')}-${base.id}`,
      metadata: { ...base.metadata, title: `${base.metadata.title} #${i}` },
    };
  });
}

interface Box {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Sweep Line 重叠检测：只比较 x 区间相交的磁贴对，避免 O(n²) 全量两两比较 */
function sweepOverlaps(boxes: Box[]): Array<[string, string]> {
  type Ev = { x: number; kind: 0 | 1; box: Box };
  const events: Ev[] = [];
  for (const b of boxes) {
    events.push({ x: b.x, kind: 0, box: b });
    events.push({ x: b.x + b.width, kind: 1, box: b });
  }
  events.sort((p, q) => (p.x !== q.x ? p.x - q.x : p.kind - q.kind));

  const active: Box[] = [];
  const found: Array<[string, string]> = [];
  for (const ev of events) {
    if (ev.kind === 1) {
      const idx = active.indexOf(ev.box);
      if (idx >= 0) active.splice(idx, 1);
      continue;
    }
    for (const other of active) {
      const overlapX = Math.min(other.x + other.width, ev.box.x + ev.box.width) - Math.max(other.x, ev.box.x);
      const overlapY = Math.min(other.y + other.height, ev.box.y + ev.box.height) - Math.max(other.y, ev.box.y);
      if (overlapX > 1 && overlapY > 1) found.push([other.id, ev.box.id]);
    }
    active.push(ev.box);
  }
  return found;
}

interface InvariantReport {
  problems: string[];
  overlapPairs: number;
  overlapCheckMs: number;
  pairsConsidered: number;
}

function checkInvariants(
  items: MediaItem[],
  canvasWidth: number,
): { result: ReturnType<typeof computeMosaicLayout>; report: InvariantReport } {
  const result = computeMosaicLayout(items, { canvasWidth, heroEnabled: true });
  const problems: string[] = [];

  const ids = new Set<string>();
  for (const t of result.tiles) {
    if (ids.has(t.mediaId)) problems.push(`${t.mediaId}: 重复 Media ID`);
    ids.add(t.mediaId);

    const b = t.box;
    if (!Number.isFinite(b.x) || !Number.isFinite(b.y) || !Number.isFinite(b.width) || !Number.isFinite(b.height)) {
      problems.push(`${t.mediaId}: 坐标或尺寸不是有限值`);
      continue;
    }
    if (b.x < -1) problems.push(`${t.mediaId}: x < 0`);
    if (b.y < -1) problems.push(`${t.mediaId}: y < 0`);
    if (b.width <= 0) problems.push(`${t.mediaId}: width <= 0`);
    if (b.height <= 0) problems.push(`${t.mediaId}: height <= 0`);
    if (b.x + b.width > result.canvasWidth + 1) problems.push(`${t.mediaId}: 超出画布右边界`);
    if (b.y + b.height > result.canvasHeight + 1) problems.push(`${t.mediaId}: 超出画布底部`);
  }

  const boxes: Box[] = result.tiles.map((t) => ({ id: t.mediaId, ...t.box }));
  const startedOverlap = performance.now();
  const overlaps = sweepOverlaps(boxes);
  const overlapCheckMs = performance.now() - startedOverlap;
  for (const [a, b] of overlaps.slice(0, 10)) problems.push(`${a} 与 ${b} 重叠`);

  return {
    result,
    report: {
      problems,
      overlapPairs: overlaps.length,
      overlapCheckMs: Number(overlapCheckMs.toFixed(2)),
      pairsConsidered: boxes.length,
    },
  };
}

describe('布局不变量：40/200/500/1000 条 × 四种画布宽度', () => {
  const counts = [40, 200, 500, 1000];
  const widths = [1280, 1920, 2560, 3440];

  it.each(counts.map((n) => [n] as const))('%i 条数据在所有画布宽度下满足全部不变量', (n) => {
    const items = stress(n);
    for (const width of widths) {
      const { report } = checkInvariants(items, width);
      expect(report.problems, `${n} 条 @ ${width}px：${report.problems.slice(0, 3).join('; ')}`).toEqual([]);
      expect(report.overlapPairs).toBe(0);
    }
  });

  it('1000 条 × 1280 与 1920 完整零重叠（Sweep Line 全量检查）', () => {
    const items = stress(1000);
    for (const width of [1280, 1920]) {
      const { result, report } = checkInvariants(items, width);
      expect(report.overlapPairs, `${width}px 存在 ${report.overlapPairs} 对重叠`).toBe(0);
      expect(result.tiles).toHaveLength(1000);
      // 与既有两两比较验证器结论一致
      expect(validateMosaic(result).filter((p) => p.includes('重叠'))).toEqual([]);
    }
  });

  it('自定义顺序在 1000 条布局中不被破坏', () => {
    const items = stress(1000);
    // 把最后一条拖到最前，只给它序号 0（部分自定义）
    const order = { [items[items.length - 1]!.id]: 0 };
    const result = computeMosaicLayout(items, { canvasWidth: 1280, customOrder: order, heroEnabled: true });
    // 布局 order 字段按排好后的顺序递增：被拖到最前的那条 order=0
    const moved = result.tiles.find((t) => t.mediaId === items[items.length - 1]!.id)!;
    expect(moved.order).toBe(0);
  });

  it('连续尺寸仍然成立（不同宽度值随条目数增长，不是六档）', () => {
    const small = new Set(computeMosaicLayout(stress(40), { canvasWidth: 1920 }).tiles.map((t) => t.box.width)).size;
    const large = new Set(computeMosaicLayout(stress(1000), { canvasWidth: 1920 }).tiles.map((t) => t.box.width)).size;
    expect(large).toBeGreaterThan(small);
    expect(large).toBeGreaterThan(100);
  });

  it('记录布局耗时与重叠检测耗时（中位数 / P95），供性能报告引用', () => {
    const items = stress(1000);
    const layoutTimes: number[] = [];
    const overlapTimes: number[] = [];
    for (let round = 0; round < 7; round += 1) {
      const started = performance.now();
      const result = computeMosaicLayout(items, { canvasWidth: 1920, heroEnabled: true });
      layoutTimes.push(performance.now() - started);
      const t0 = performance.now();
      sweepOverlaps(result.tiles.map((t) => ({ id: t.mediaId, ...t.box })));
      overlapTimes.push(performance.now() - t0);
    }
    const stat = (list: number[]) => {
      const sorted = [...list].sort((a, b) => a - b);
      const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]!;
      return {
        medianMs: Number(at(0.5).toFixed(2)),
        p95Ms: Number(at(0.95).toFixed(2)),
        minMs: Number(sorted[0]!.toFixed(2)),
        maxMs: Number(sorted[sorted.length - 1]!.toFixed(2)),
      };
    };
    const summary = {
      items: 1000,
      canvasWidth: 1920,
      rounds: 7,
      layout: stat(layoutTimes),
      overlapCheck: stat(overlapTimes),
    };
    // 输出真实测量值，供 docs/testing/performance-report.md 引用
    console.warn(`[invariants] ${JSON.stringify(summary)}`);
    expect(summary.layout.medianMs).toBeLessThan(200);
    expect(summary.overlapCheck.medianMs).toBeLessThan(200);
  });
});
