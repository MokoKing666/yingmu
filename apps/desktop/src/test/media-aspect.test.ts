import { describe, it, expect } from 'vitest';
import { mediaAspect, mediaArtworkAspect, artworkFit } from '@/lib/media-aspect';
import { buildDemoLibrary } from '@/lib/demo-data';
import type { MediaItem } from '@yingmu/media-models';

const items = buildDemoLibrary();

function withMetadata(item: MediaItem, patch: Partial<MediaItem['metadata']>): MediaItem {
  return { ...item, metadata: { ...item.metadata, ...patch } };
}

describe('真实媒体比例解析', () => {
  it('优先使用元数据里的真实海报比例', () => {
    const base = items[0]!;
    expect(mediaAspect(withMetadata(base, { posterAspect: 0.7 }))).toBeCloseTo(0.7, 5);
    expect(mediaAspect(withMetadata(base, { posterAspect: 1.5 }))).toBeCloseTo(1.5, 5);
  });

  it('忽略明显异常的海报比例，回退到类型默认值', () => {
    const movie = items.find((i) => i.kind === 'movie')!;
    expect(mediaAspect(withMetadata(movie, { posterAspect: 0.01 }))).toBeCloseTo(2 / 3, 5);
    expect(mediaAspect(withMetadata(movie, { posterAspect: 99 }))).toBeCloseTo(2 / 3, 5);
  });

  it('个人视频使用视频画面的真实宽高比', () => {
    const personal = items.find((i) => i.kind === 'personal')!;
    const withVideo: MediaItem = {
      ...personal,
      metadata: { ...personal.metadata, posterAspect: undefined },
      versions: personal.versions.map((v, idx) =>
        idx === 0 ? { ...v, video: { ...v.video!, width: 1920, height: 1080 } } : v,
      ),
    };
    expect(mediaAspect(withVideo)).toBeCloseTo(16 / 9, 4);
  });

  it('电影/剧集/动画回退 2:3，纪录片回退 4:3', () => {
    const movie = items.find((i) => i.kind === 'movie')!;
    const doc = items.find((i) => i.kind === 'documentary')!;
    expect(mediaAspect(withMetadata(movie, { posterAspect: undefined }))).toBeCloseTo(2 / 3, 5);
    expect(mediaAspect(withMetadata(doc, { posterAspect: undefined }))).toBeCloseTo(4 / 3, 5);
  });

  it('比例只由元数据决定，不随 Media ID 变化', () => {
    const base = withMetadata(items[0]!, { posterAspect: undefined });
    const a: MediaItem = { ...base, id: 'id-aaa' };
    const b: MediaItem = { ...base, id: 'id-zzz' };
    expect(mediaAspect(a)).toBe(mediaAspect(b));
  });
});

function withVideo(item: MediaItem, width: number, height: number): MediaItem {
  return {
    ...item,
    metadata: { ...item.metadata, posterAspect: undefined, thumbnailAspect: undefined },
    versions: item.versions.map((v, idx) =>
      idx === 0 ? { ...v, video: { ...v.video!, width, height } } : v,
    ),
  };
}

describe('常见画幅必须原样保留（任务书 8.x）', () => {
  const personal = () => items.find((i) => i.kind === 'personal')!;

  it.each([
    ['2:3 海报', 2 / 3, 2 / 3],
    ['3:2 横向剧照', 3 / 2, 3 / 2],
    ['16:9 视频', 1920 / 1080, 16 / 9],
    ['4:3 视频', 1440 / 1080, 4 / 3],
    ['21:9 视频', 2520 / 1080, 21 / 9],
    ['1:1 视频', 1080 / 1080, 1],
  ])('%s 解析为 %f', (_label, input, expected) => {
    const item = withVideo(personal(), Math.round(input * 1000), 1000);
    expect(mediaAspect(item)).toBeCloseTo(expected, 3);
  });

  it('16:9 不会被映射成 1.45:1（个人视频保留真实画幅）', () => {
    const item = withVideo(personal(), 1920, 1080);
    expect(mediaAspect(item)).toBeCloseTo(16 / 9, 3);
    expect(mediaAspect(item)).not.toBeCloseTo(1.45, 2);
  });

  it('21:9 不会丢掉宽幅（不被压成 16:9）', () => {
    const item = withVideo(personal(), 2520, 1080);
    expect(mediaAspect(item)).toBeCloseTo(21 / 9, 3);
  });

  it('1:1 不会被拉成 2:3 或 16:9', () => {
    const item = withVideo(personal(), 1000, 1000);
    expect(mediaAspect(item)).toBeCloseTo(1, 5);
  });

  it('异常 / 缺失比例安全回退，不产生 NaN 或 Infinity', () => {
    const movie = items.find((i) => i.kind === 'movie')!;
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, -3, 0, 999]) {
      const value = mediaAspect(withMetadata(movie, { posterAspect: bad }));
      expect(Number.isFinite(value)).toBe(true);
      expect(value).toBeCloseTo(2 / 3, 5);
    }
    // 完全没有视频流信息的个人视频回退 16:9
    const bare: MediaItem = {
      ...personal(),
      metadata: { ...personal().metadata, thumbnailAspect: undefined },
      versions: [],
    };
    expect(mediaAspect(bare)).toBeCloseTo(16 / 9, 5);
  });
});

describe('海报 / 背景图 / 缩略图比例分离', () => {
  it('超大横幅优先用 backdrop 比例，不拿竖版海报硬撑', () => {
    const movie = items.find((i) => i.kind === 'movie')!;
    const m = withMetadata(movie, { posterAspect: 2 / 3, backdropAspect: 16 / 9, thumbnailAspect: 1 });
    expect(mediaArtworkAspect(m, 'backdrop')).toBeCloseTo(16 / 9, 5);
    expect(mediaArtworkAspect(m, 'poster')).toBeCloseTo(2 / 3, 5);
    expect(mediaArtworkAspect(m, 'thumbnail')).toBeCloseTo(1, 5);
  });

  it('缺 backdrop 时才回退到海报比例，而不是拉伸', () => {
    const movie = items.find((i) => i.kind === 'movie')!;
    const m = withMetadata(movie, { posterAspect: 2 / 3, backdropAspect: undefined });
    expect(mediaArtworkAspect(m, 'backdrop')).toBeCloseTo(2 / 3, 5);
  });

  it('个人视频缩略图优先真实画幅', () => {
    const p = withVideo(items.find((i) => i.kind === 'personal')!, 1920, 1080);
    expect(mediaArtworkAspect(p, 'thumbnail')).toBeCloseTo(16 / 9, 5);
  });
});

describe('图片填充方式：个人视频不裁切', () => {
  it('个人视频默认 contain（保留完整画面）', () => {
    const p = items.find((i) => i.kind === 'personal')!;
    expect(artworkFit(p)).toBe('contain');
  });

  it('海报 / 剧照默认 cover（磁贴裁切是设计意图）', () => {
    for (const kind of ['movie', 'tv', 'anime', 'documentary'] as const) {
      const m = items.find((i) => i.kind === kind)!;
      expect(artworkFit(m)).toBe('cover');
    }
  });

  it('个人视频的可视面积利用率：contain 下画面完整，不做大幅裁切', () => {
    // 21:9 画面放进 1.45:1 磁贴：cover 会裁掉左右各 ~31% 的画面宽度
    const frameAspect = 1.45;
    const videoAspect = 21 / 9;
    const coverVisibleWidth = Math.min(1, frameAspect / videoAspect);
    expect(coverVisibleWidth).toBeLessThan(0.72); // cover 会明显裁掉画面
    // contain 的可见宽度恒为 1（完整画幅）
    expect(artworkFit(withVideo(items.find((i) => i.kind === 'personal')!, 2520, 1080))).toBe('contain');
  });
});
