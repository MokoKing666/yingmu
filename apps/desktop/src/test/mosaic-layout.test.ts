import { describe, it, expect } from 'vitest';
import {
  computeMosaicLayout,
  computeWallLayout,
  validateLayout,
  validateMosaic,
  toCustomOrder,
  orderByRecommendation,
} from '@/lib/wall-layout';
import { buildDemoLibrary } from '@/lib/demo-data';
import type { MediaItem } from '@yingmu/media-models';

const items = buildDemoLibrary();

function stress(count: number): MediaItem[] {
  return Array.from({ length: count }, (_, i) => {
    const base = items[i % items.length]!;
    return { ...base, id: `${base.id}-stress-${i}` };
  });
}

describe('无级拼贴布局引擎', () => {
  it('空库返回空画布', () => {
    const result = computeMosaicLayout([]);
    expect(result.tiles).toEqual([]);
    expect(result.canvasHeight).toBe(0);
  });

  it('所有磁贴零重叠、不超出画布右边界', () => {
    for (const width of [1280, 1920, 2560, 3440]) {
      const result = computeMosaicLayout(items, { canvasWidth: width });
      expect(validateMosaic(result), `画布 ${width}px`).toEqual([]);
      expect(result.tiles.every((t) => t.box.x + t.box.width <= width + 1)).toBe(true);
    }
  });

  it('尺寸是连续值，不是六种固定档位', () => {
    const result = computeMosaicLayout(items, { canvasWidth: 1920 });
    const widths = new Set(result.tiles.map((t) => t.box.width));
    const heights = new Set(result.tiles.map((t) => t.box.height));
    const areas = result.tiles.map((t) => t.box.width * t.box.height);
    expect(widths.size).toBeGreaterThan(12);
    expect(heights.size).toBeGreaterThan(10);
    expect(Math.max(...areas) / Math.min(...areas)).toBeGreaterThan(4);
  });

  it('同时存在超大横幅、超大竖版、宽幅、方形与不规则磁贴', () => {
    const result = computeMosaicLayout(items, { canvasWidth: 2560 });
    const scales = new Set(result.tiles.map((t) => t.box.scale));
    expect(scales.has('ultra-wide')).toBe(true);
    expect(scales.size).toBeGreaterThanOrEqual(5);
    expect(result.tiles.some((t) => t.box.aspect >= 2.3)).toBe(true);
    expect(result.tiles.some((t) => t.box.aspect <= 0.8)).toBe(true);
  });

  it('同一批数据多次计算完全一致（纯函数）', () => {
    const a = computeMosaicLayout(items, { canvasWidth: 1920 });
    const b = computeMosaicLayout(items, { canvasWidth: 1920 });
    expect(a).toEqual(b);
  });

  it('自定义拖拽排序后首位稳定且布局仍无重叠', () => {
    const ids = [...items].reverse().map((i) => i.id);
    const result = computeMosaicLayout(items, {
      canvasWidth: 1920,
      customOrder: toCustomOrder(ids),
    });
    expect(result.tiles[0]!.mediaId).toBe(ids[0]);
    expect(validateMosaic(result)).toEqual([]);
  });

  it('用户自定义权重会改变磁贴面积', () => {
    const id = items[3]!.id;
    const before = computeMosaicLayout(items, { canvasWidth: 1920 });
    const after = computeMosaicLayout(items, {
      canvasWidth: 1920,
      customWeights: { [id]: 0.9 },
    });
    const a = before.tiles.find((t) => t.mediaId === id)!.box;
    const b = after.tiles.find((t) => t.mediaId === id)!.box;
    expect(b.width * b.height).toBeGreaterThan(a.width * a.height);
  });

  it('用户焦点覆盖进入 box.objectPosition', () => {
    const id = items[2]!.id;
    const result = computeMosaicLayout(items, {
      canvasWidth: 1920,
      focalResolver: (item) => (item.id === id ? { x: 20, y: 80 } : undefined),
    });
    expect(result.tiles.find((t) => t.mediaId === id)!.box.objectPosition).toBe('20% 80%');
  });

  it('窗口缩放后重新编排且保持稳定，不产生水平溢出', () => {
    const narrow = computeMosaicLayout(items, { canvasWidth: 1280 });
    const wide = computeMosaicLayout(items, { canvasWidth: 3440 });
    // 两种画布确实给出不同的连续坐标，且各自可复现
    expect(narrow.tiles.map((t) => [t.box.x, t.box.y, t.box.width])).not.toEqual(
      wide.tiles.map((t) => [t.box.x, t.box.y, t.box.width]),
    );
    expect(computeMosaicLayout(items, { canvasWidth: 3440 })).toEqual(wide);
    expect(validateMosaic(narrow)).toEqual([]);
    expect(validateMosaic(wide)).toEqual([]);
    expect(wide.tiles.every((t) => t.box.x + t.box.width <= 3441)).toBe(true);
    // 超宽屏上仍然保留明显的尺寸反差
    const areas = wide.tiles.map((t) => t.box.width * t.box.height);
    expect(Math.max(...areas) / Math.min(...areas)).toBeGreaterThan(4);
  });

  it('兼容旧 computeWallLayout / validateLayout 契约', () => {
    const layouts = computeWallLayout(items);
    expect(layouts).toHaveLength(items.length);
    expect(validateLayout(layouts)).toEqual([]);
    expect(layouts.every((l) => l.colSpan >= 1 && l.colSpan <= 12)).toBe(true);
  });

  it('性能基线：40/200/500/1000 条与四种分辨率的真实测量', () => {
    const counts = [40, 200, 500, 1000];
    const byCount = counts.map((count) => {
      const data = stress(count);
      const started = performance.now();
      const result = computeMosaicLayout(data, { canvasWidth: 1920 });
      const elapsed = performance.now() - started;
      // 模拟首屏可见区间：1080px 视口 + 上下各 700px overscan
      const mounted = result.tiles.filter(
        (t) => t.box.y + t.box.height >= -700 && t.box.y <= 1780,
      ).length;
      return {
        items: count,
        layoutMs: Number(elapsed.toFixed(2)),
        canvasHeight: result.canvasHeight,
        firstScreenMounted: mounted,
        distinctWidths: new Set(result.tiles.map((t) => t.box.width)).size,
      };
    });
    const byWidth = [1280, 1920, 2560, 3440].map((width) => {
      const result = computeMosaicLayout(items, { canvasWidth: width });
      const areas = result.tiles.map((t) => t.box.width * t.box.height);
      return {
        width,
        canvasHeight: result.canvasHeight,
        tiles: result.tiles.length,
        areaRatio: Number((Math.max(...areas) / Math.min(...areas)).toFixed(1)),
        overflow: result.tiles.some((t) => t.box.x + t.box.width > width + 1),
        overlaps: validateMosaic(result).filter((p) => p.includes('重叠')).length,
      };
    });
    console.warn(`[perf] byCount=${JSON.stringify(byCount)} byWidth=${JSON.stringify(byWidth)}`);
    // 虚拟化有效：无论总条目多少，首屏挂载量都与视口同阶
    expect(byCount.every((r) => r.firstScreenMounted < 200)).toBe(true);
    expect(byWidth.every((r) => !r.overflow && r.overlaps === 0)).toBe(true);
  });

  it('1000 条数据仍能确定性完成布局，且画布高度有限', () => {
    const many = stress(1000);
    const started = performance.now();
    const result = computeMosaicLayout(many, { canvasWidth: 1920 });
    const elapsed = performance.now() - started;
    expect(result.tiles).toHaveLength(1000);
    expect(result.canvasHeight).toBeGreaterThan(0);
    expect(Number.isFinite(result.canvasHeight)).toBe(true);
    expect(result.tiles.every((t) => t.box.x + t.box.width <= 1921)).toBe(true);
    // 记录真实耗时，性能报告以这里的数据为准；宽松上限只防回归到 O(n^3) 级别
    expect(elapsed).toBeLessThan(8000);
    console.warn(`[mosaic] 1000 条布局耗时 ${elapsed.toFixed(1)}ms，画布高 ${result.canvasHeight}px`);
  });

  it('默认严格保留调用方顺序：LibraryPage 的评分/年份排序不被 addedAt 覆盖', () => {
    const byRating = [...items].sort((a, b) => (b.metadata.rating ?? 0) - (a.metadata.rating ?? 0));
    const result = computeMosaicLayout(byRating, { canvasWidth: 1920 });
    expect(result.tiles.map((t) => t.mediaId)).toEqual(byRating.map((i) => i.id));

    const byTitle = [...items].sort((a, b) => a.metadata.title.localeCompare(b.metadata.title, 'zh-CN'));
    const result2 = computeMosaicLayout(byTitle, { canvasWidth: 1280 });
    expect(result2.tiles.map((t) => t.mediaId)).toEqual(byTitle.map((i) => i.id));
  });

  it('首页推荐顺序确定性，且首项不再是「最早加入」的那一部', () => {
    const ordered = orderByRecommendation(items);
    expect(ordered.map((i) => i.id)).toEqual(orderByRecommendation(items).map((i) => i.id));
    const earliest = [...items].sort((a, b) => a.addedAt.localeCompare(b.addedAt))[0]!;
    expect(ordered[0]!.id).not.toBe(earliest.id);
    expect(ordered).toHaveLength(items.length);
  });

  it('同条件下收藏与续播在推荐中权重更高', () => {
    const base = items[0]!;
    const plain = { ...base, id: 'aaa-plain', favorite: false, resumeSeconds: undefined };
    const featured = { ...base, id: 'zzz-featured', favorite: true, resumeSeconds: 120 };
    const ordered = orderByRecommendation([plain, featured]);
    expect(ordered[0]!.id).toBe('zzz-featured');
  });

  it('自定义排序优先于推荐顺序', () => {
    const reversed = [...items].reverse();
    const result = computeMosaicLayout(items, {
      canvasWidth: 1920,
      customOrder: toCustomOrder(reversed.map((i) => i.id)),
    });
    expect(result.tiles[0]!.mediaId).toBe(reversed[0]!.id);
  });
});
