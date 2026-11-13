/**
 * 1000 条布局的完整不变量验证（任务书 8）。
 *
 * 检测器本体在 `@/lib/mosaic-validate`（产品代码，非测试私有实现）：
 *  - Sweep Line 全量重叠检测，EPSILON = 0.01px；
 *  - 边缘精确接触不算重叠，0.1px / 0.5px / 1px 的真实重叠必须检出；
 *  - 越界 0.5px / 1px 都不合格（不允许「1px 以内算通过」）。
 *
 * 性能数据（布局耗时 / 重叠检测耗时 / 中位数 / P95）由测试真实输出，
 * 供 docs/testing/performance-report.md 引用；**不做任何 FPS 宣称**。
 */
import { describe, it, expect } from 'vitest';
import { computeMosaicLayout, validateMosaic } from '@/lib/wall-layout';
import { buildDemoLibrary } from '@/lib/demo-data';
import { checkMosaicInvariants, OVERLAP_EPSILON, sweepOverlaps } from '@/lib/mosaic-validate';
import type { LayoutBox } from '@/lib/mosaic-validate';
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

function boxesOf(result: ReturnType<typeof computeMosaicLayout>): LayoutBox[] {
  return result.tiles.map((t) => ({
    mediaId: t.mediaId,
    x: t.box.x,
    y: t.box.y,
    width: t.box.width,
    height: t.box.height,
  }));
}

function box(id: string, x: number, y: number, width: number, height: number): LayoutBox {
  return { mediaId: id, x, y, width, height };
}

describe('重叠检测器：注入式精度验证（任务书 8.1）', () => {
  it('0.1px 重叠必须检出', () => {
    const pairs = sweepOverlaps([box('a', 0, 0, 100, 100), box('b', 100 - 0.1, 0, 100, 100)]);
    expect(pairs).toEqual([['a', 'b']]);
  });

  it('0.5px 重叠必须检出', () => {
    const pairs = sweepOverlaps([box('a', 0, 0, 100, 100), box('b', 99.5, 0, 100, 100)]);
    expect(pairs).toEqual([['a', 'b']]);
  });

  it('1px 重叠必须检出', () => {
    const pairs = sweepOverlaps([box('a', 0, 0, 100, 100), box('b', 99, 0, 100, 100)]);
    expect(pairs).toEqual([['a', 'b']]);
  });

  it('仅 y 向 1px 重叠也必须检出（两个方向都要超过 epsilon）', () => {
    const pairs = sweepOverlaps([box('a', 0, 0, 100, 100), box('b', 50, 99, 100, 100)]);
    expect(pairs).toEqual([['a', 'b']]);
  });

  it('边缘精确接触不算重叠', () => {
    const pairs = sweepOverlaps([box('a', 0, 0, 100, 100), box('b', 100, 0, 100, 100)]);
    expect(pairs).toEqual([]);
  });

  it('接近接触但在 epsilon 内（0.005px）不算重叠', () => {
    const pairs = sweepOverlaps([box('a', 0, 0, 100, 100), box('b', 100 - 0.005, 0, 100, 100)]);
    expect(pairs).toEqual([]);
  });

  it('EPSILON 常量为 0.01px（明确的数值约定）', () => {
    expect(OVERLAP_EPSILON).toBe(0.01);
  });
});

describe('边界检测器：注入式验证（任务书 8.2）', () => {
  const W = 1000;
  const H = 800;

  it('0.5px 越界必须报告', () => {
    const report = checkMosaicInvariants([box('a', W - 100 + 0.5, 0, 100, 100)], W, H);
    expect(report.problems.some((p) => p.includes('右边界'))).toBe(true);
  });

  it('1px 越界必须报告', () => {
    const report = checkMosaicInvariants([box('a', W - 99, 0, 100, 100)], W, H);
    expect(report.problems.some((p) => p.includes('右边界'))).toBe(true);
  });

  it('左 / 上 / 底边界同样严格', () => {
    expect(
      checkMosaicInvariants([box('a', -0.5, 0, 100, 100)], W, H).problems.some((p) => p.includes('左边界')),
    ).toBe(true);
    expect(
      checkMosaicInvariants([box('a', 0, -0.5, 100, 100)], W, H).problems.some((p) => p.includes('上边界')),
    ).toBe(true);
    expect(
      checkMosaicInvariants([box('a', 0, H - 100 + 0.5, 100, 100)], W, H).problems.some((p) =>
        p.includes('底部'),
      ),
    ).toBe(true);
  });

  it('贴边（x + width == canvasWidth）不算越界', () => {
    const report = checkMosaicInvariants([box('a', W - 100, 0, 100, 100)], W, H);
    expect(report.problems).toEqual([]);
  });

  it('NaN / Infinity 必须报告为非法值', () => {
    const nan = checkMosaicInvariants([box('a', Number.NaN, 0, 100, 100)], W, H);
    expect(nan.problems.some((p) => p.includes('不是有限值'))).toBe(true);
    const inf = checkMosaicInvariants([box('a', 0, 0, Number.POSITIVE_INFINITY, 100)], W, H);
    expect(inf.problems.some((p) => p.includes('不是有限值'))).toBe(true);
  });

  it('负尺寸 / 零尺寸必须报告', () => {
    const negative = checkMosaicInvariants([box('a', 0, 0, -100, 100)], W, H);
    expect(negative.problems.some((p) => p.includes('尺寸必须为正'))).toBe(true);
    const zero = checkMosaicInvariants([box('a', 0, 0, 100, 0)], W, H);
    expect(zero.problems.some((p) => p.includes('尺寸必须为正'))).toBe(true);
  });

  it('重复 Media ID 必须报告', () => {
    const report = checkMosaicInvariants([box('a', 0, 0, 50, 50), box('a', 100, 0, 50, 50)], W, H);
    expect(report.problems.some((p) => p.includes('重复 Media ID'))).toBe(true);
  });
});

describe('布局不变量：40/200/500/1000 条 × 四种画布宽度', () => {
  const counts = [40, 200, 500, 1000];
  const widths = [1280, 1920, 2560, 3440];

  it.each(counts.map((n) => [n] as const))('%i 条数据在所有画布宽度下满足全部不变量', (n) => {
    const items = stress(n);
    for (const width of widths) {
      const result = computeMosaicLayout(items, { canvasWidth: width, heroEnabled: true });
      const report = checkMosaicInvariants(boxesOf(result), result.canvasWidth, result.canvasHeight);
      expect(report.problems, `${n} 条 @ ${width}px：${report.problems.slice(0, 3).join('; ')}`).toEqual([]);
      expect(report.overlapPairs).toBe(0);
    }
  });

  it('1000 条 × 1280 与 1920 完整零重叠（Sweep Line 全量检查）', () => {
    const items = stress(1000);
    for (const width of [1280, 1920]) {
      const result = computeMosaicLayout(items, { canvasWidth: width, heroEnabled: true });
      const report = checkMosaicInvariants(boxesOf(result), result.canvasWidth, result.canvasHeight);
      expect(report.overlapPairs, `${width}px 存在 ${report.overlapPairs} 对重叠`).toBe(0);
      expect(result.tiles).toHaveLength(1000);
      // 与旧的两两比较验证器交叉验证，结论必须一致
      expect(validateMosaic(result).filter((p) => p.includes('重叠'))).toEqual([]);
    }
  });

  it('自定义顺序在 1000 条布局中不被破坏', () => {
    const items = stress(1000);
    const order = { [items[items.length - 1]!.id]: 0 };
    const result = computeMosaicLayout(items, { canvasWidth: 1280, customOrder: order, heroEnabled: true });
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
      const report = checkMosaicInvariants(boxesOf(result), result.canvasWidth, result.canvasHeight);
      overlapTimes.push(report.overlapCheckMs);
      expect(report.overlapPairs).toBe(0);
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
      epsilonPx: OVERLAP_EPSILON,
    };
    // 输出真实测量值，供 docs/testing/performance-report.md 引用
    console.warn(`[invariants] ${JSON.stringify(summary)}`);
    expect(summary.layout.medianMs).toBeLessThan(200);
    expect(summary.overlapCheck.medianMs).toBeLessThan(200);
  });
});
