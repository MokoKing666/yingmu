import { describe, it, expect } from 'vitest';
import {
  computeWallLayout,
  computeMosaicLayout,
  validateLayout,
  variantForItem,
  toCustomOrder,
  WALL_PATTERN,
} from '@/lib/wall-layout';
import { buildDemoLibrary } from '@/lib/demo-data';
import { mediaAspect } from '@/lib/media-aspect';
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

describe('个人视频真实画幅在布局中被保留', () => {
  function personalWith(width: number, height: number) {
    const base = items.find((i) => i.kind === 'personal')!;
    return {
      ...base,
      id: `personal-${width}x${height}`,
      metadata: { ...base.metadata, posterAspect: undefined, thumbnailAspect: undefined },
      versions: base.versions.map((v, idx) =>
        idx === 0 ? { ...v, video: { ...v.video!, width, height } } : v,
      ),
    };
  }

  it.each([
    [1920, 1080],
    [1440, 1080],
    [2520, 1080],
    [1080, 1080],
  ])('源 %i×%i 的磁贴几何比例 = 真实画幅（不参与比例分档）', (w, h) => {
    const item = personalWith(w, h)!;
    const result = computeMosaicLayout([item], {
      canvasWidth: 1280,
      heroEnabled: false,
      aspectResolver: mediaAspect,
      preserveAspect: (it) => it.kind === 'personal',
    });
    const tileBox = result.tiles[0]!.box;
    expect(tileBox.width / tileBox.height).toBeCloseTo(w / h, 1);
  });

  it('普通海报仍参与 Folia 比例分档（视觉多样性保留）', () => {
    const movie = items.find((i) => i.kind === 'movie')!;
    const result = computeMosaicLayout([movie], {
      canvasWidth: 1280,
      heroEnabled: false,
      aspectResolver: () => 2 / 3,
      preserveAspect: (it) => it.kind === 'personal',
    });
    const ratio = result.tiles[0]!.box.width / result.tiles[0]!.box.height;
    // 2:3 = 0.667 的源会被映射到竖版区间，但不会等于 0.667 那个精确值
    expect(ratio).toBeGreaterThan(0.3);
    expect(ratio).toBeLessThan(1.05);
  });
});
