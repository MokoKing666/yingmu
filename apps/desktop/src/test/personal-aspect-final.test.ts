/**
 * 个人视频最终几何比例测试（任务书 7.4）。
 *
 * 输入层（mediaAspect）解析正确只是第一步；本文件直接断言**最终布局输出**
 * `tile.box.aspect`，证明宽高没有在尺寸钳制/宽度试探环节被独立修改。
 *
 * 容差依据像素取整精度：box.width/height 是 Math.round 后的整数，
 * 渲染宽高比与真实比例的最大偏差 = (0.5 + 0.5·source) / height。
 * 不允许用更宽的容差掩盖「比例被压扁」的回归。
 */
import { describe, it, expect } from 'vitest';
import { computeMosaicLayout } from '@/lib/wall-layout';
import { buildDemoLibrary } from '@/lib/demo-data';
import { mediaAspect } from '@/lib/media-aspect';
import type { MediaItem } from '@yingmu/media-models';

const seed = buildDemoLibrary();

function personal(width: number, height: number, id: string): MediaItem {
  const base = seed.find((i) => i.kind === 'personal')!;
  return {
    ...base,
    id,
    metadata: { ...base.metadata, posterAspect: undefined, thumbnailAspect: undefined },
    versions: base.versions.map((v, idx) =>
      idx === 0 ? { ...v, video: { ...v.video!, width, height } } : v,
    ),
  } as MediaItem;
}

/** 渲染几何（取整像素）与真实比例的最大允许偏差 */
function roundingTolerance(box: { width: number; height: number }, source: number): number {
  return (0.5 * (1 + source)) / Math.min(box.height, box.width / source) + 1e-9;
}

const RATIOS: Array<[string, number, number]> = [
  ['16:9', 1920, 1080],
  ['4:3', 1440, 1080],
  ['21:9', 2520, 1080],
  ['1:1', 1000, 1000],
  ['3:2', 1500, 1000],
  ['2:3（竖版视频）', 1000, 1500],
  ['极端宽 3.4:1（会被安全钳制到 2.9）', 3400, 1000],
  ['极端高 1:3.4（会被安全钳制到 0.4）', 1000, 3400],
];

describe('个人视频最终布局几何 = 真实画幅', () => {
  for (const [label, w, h] of RATIOS) {
    const clamped = Math.min(2.9, Math.max(0.4, w / h));
    it(`${label}：单条 hero 磁贴在 1920/2560/3440 下 aspect 都等于 ${clamped.toFixed(3)}`, () => {
      const item = personal(w, h, `personal-${w}x${h}`);
      for (const canvasWidth of [1920, 2560, 3440]) {
        const result = computeMosaicLayout([item], {
          canvasWidth,
          heroEnabled: true,
          aspectResolver: mediaAspect,
          preserveAspect: (it2) => it2.kind === 'personal',
        });
        expect(result.tiles).toHaveLength(1);
        const box = result.tiles[0]!.box;
        const tol = roundingTolerance(box, clamped);
        // tile.box.aspect 是引擎输出的最终几何比例
        expect(Math.abs(box.aspect - clamped)).toBeLessThanOrEqual(tol);
        // 渲染几何（取整像素）同样成立
        expect(Math.abs(box.width / box.height - clamped)).toBeLessThanOrEqual(tol);
      }
    });
  }

  it('高 emphasis 与低 emphasis 的个人视频都保持真实比例（非 hero 位置）', () => {
    const filler = seed.find((i) => i.kind === 'movie')!;
    const wide = personal(2520, 1080, 'personal-21x9');
    for (const weight of [1, -1]) {
      const result = computeMosaicLayout([filler, wide], {
        canvasWidth: 1920,
        heroEnabled: false,
        aspectResolver: mediaAspect,
        preserveAspect: (it) => it.kind === 'personal',
        customWeights: { [wide.id]: weight },
      });
      const box = result.tiles.find((t) => t.mediaId === wide.id)!.box;
      const tol = roundingTolerance(box, 21 / 9);
      expect(Math.abs(box.aspect - 21 / 9)).toBeLessThanOrEqual(tol);
    }
  });

  it('个人视频磁贴仍满足最小可见尺寸（统一缩放不产生细线磁贴）', () => {
    const item = personal(3400, 1000, 'personal-ultrawide');
    for (const canvasWidth of [1920, 2560, 3440]) {
      const result = computeMosaicLayout([item], {
        canvasWidth,
        heroEnabled: false,
        aspectResolver: mediaAspect,
        preserveAspect: (it) => it.kind === 'personal',
      });
      const box = result.tiles[0]!.box;
      expect(box.height).toBeGreaterThanOrEqual(60);
      expect(box.width).toBeLessThanOrEqual(canvasWidth);
    }
  });

  it('混合画布中个人视频与海报磁贴互不干扰（海报仍参与比例分档）', () => {
    const items: MediaItem[] = [
      personal(1920, 1080, 'personal-a'),
      seed.find((i) => i.kind === 'movie')!,
      personal(1440, 1080, 'personal-b'),
      seed.find((i) => i.kind === 'anime')!,
    ];
    const result = computeMosaicLayout(items, {
      canvasWidth: 1920,
      heroEnabled: false,
      aspectResolver: mediaAspect,
      preserveAspect: (it) => it.kind === 'personal',
    });
    const a = result.tiles.find((t) => t.mediaId === 'personal-a')!.box;
    expect(Math.abs(a.aspect - 16 / 9)).toBeLessThanOrEqual(roundingTolerance(a, 16 / 9));
    const b = result.tiles.find((t) => t.mediaId === 'personal-b')!.box;
    expect(Math.abs(b.aspect - 4 / 3)).toBeLessThanOrEqual(roundingTolerance(b, 4 / 3));
  });
});
