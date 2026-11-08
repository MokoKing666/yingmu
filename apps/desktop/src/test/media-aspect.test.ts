import { describe, it, expect } from 'vitest';
import { mediaAspect } from '@/lib/media-aspect';
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
