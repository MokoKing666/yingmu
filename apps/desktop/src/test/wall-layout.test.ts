import { describe, it, expect } from 'vitest';
import { computeWallLayout, validateLayout, variantForItem, toCustomOrder, WALL_PATTERN } from '@/lib/wall-layout';
import { buildDemoLibrary } from '@/lib/demo-data';
import { tile } from '@yingmu/design-tokens';

const items = buildDemoLibrary();

describe('computeWallLayout', () => {
  it('空库返回空布局', () => {
    expect(computeWallLayout([])).toEqual([]);
  });

  it('为每个条目生成唯一且连续的 order', () => {
    const layouts = computeWallLayout(items);
    expect(layouts).toHaveLength(items.length);
    expect(new Set(layouts.map((l) => l.order)).size).toBe(items.length);
    expect(layouts.map((l) => l.order)).toEqual([...Array(layouts.length).keys()]);
  });

  it('首条目为大主视觉，且至少覆盖 6 种磁贴形态中的 4 种', () => {
    const layouts = computeWallLayout(items, { heroEnabled: true });
    expect(layouts[0]!.variant).toBe('hero');
    expect(new Set(layouts.map((l) => l.variant)).size).toBeGreaterThanOrEqual(4);
  });

  it('关闭 hero 后不出现 hero 形态', () => {
    const layouts = computeWallLayout(items, { heroEnabled: false });
    expect(layouts.some((l) => l.variant === 'hero')).toBe(false);
  });

  it('所有列跨度在 1–12 之间且布局自检无问题', () => {
    const layouts = computeWallLayout(items);
    expect(layouts.every((l) => l.colSpan >= 1 && l.colSpan <= tile.gridColumns)).toBe(true);
    expect(validateLayout(layouts)).toEqual([]);
  });

  it('布局是确定性的纯函数', () => {
    expect(computeWallLayout(items)).toEqual(computeWallLayout(items));
  });

  it('自定义排序覆盖默认顺序且不丢失条目', () => {
    const ids = [...items].reverse().map((i) => i.id);
    const order = toCustomOrder(ids);
    const layouts = computeWallLayout(items, { customOrder: order });
    expect(layouts[0]!.mediaId).toBe(ids[0]);
    expect(new Set(layouts.map((l) => l.mediaId)).size).toBe(items.length);
    expect(validateLayout(layouts)).toEqual([]);
  });
});

describe('variantForItem', () => {
  it('有续播进度且额度未用完时优先 resume', () => {
    const resuming = items.find((i) => i.resumeSeconds != null && i.resumeSeconds > 0)!;
    expect(variantForItem(resuming, 3, { usedResumes: 0, heroEnabled: false })).toBe('resume');
  });
  it('续播额度用完后回落到常规节奏', () => {
    const resuming = items.find((i) => i.resumeSeconds != null && i.resumeSeconds > 0)!;
    expect(variantForItem(resuming, 3, { usedResumes: 2, heroEnabled: false })).not.toBe('resume');
  });
  it('节奏周期长度固定', () => {
    expect(WALL_PATTERN.length).toBe(8);
  });
});
