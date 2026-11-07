import { describe, it, expect } from 'vitest';
import {
  artworkSvg,
  artworkDataUri,
  artworkDimensions,
  getArtwork,
  rebuildArtworkCache,
  artworkCacheSize,
  cacheKey,
} from '@/lib/artwork';
import type { ArtworkRequest } from '@yingmu/media-models';

const spec = { seed: 'media-001', title: '雾港来信', subtitle: 'LETTERS FROM THE FOG HARBOUR', width: 320, height: 480 };

describe('artworkSvg', () => {
  it('同一 seed 生成完全一致的手工 SVG', () => {
    expect(artworkSvg(spec)).toBe(artworkSvg(spec));
  });
  it('包含渐变定义与几何母题，默认不绘制片名文字', () => {
    const svg = artworkSvg(spec);
    expect(svg).toContain('<svg');
    expect(svg).toContain('linearGradient');
    expect(svg).toContain('radialGradient');
    expect(svg).toContain('circle');
    expect(svg).not.toContain('<text');
  });
  it('需要独立海报资产时可开启片名，并正确转义 XML 特殊字符', () => {
    const svg = artworkSvg({ ...spec, showTitle: true, title: 'A & B <C>' });
    expect(svg).toContain('A &amp; B &lt;C&gt;');
    expect(svg).toContain('<text');
  });
  it('不同 seed 得到不同构图', () => {
    expect(artworkSvg(spec)).not.toBe(artworkSvg({ ...spec, seed: 'media-999' }));
  });
  it('data URI 正确编码中文片名（开启 showTitle 时）', () => {
    const uri = artworkDataUri({ ...spec, showTitle: true });
    expect(uri.startsWith('data:image/svg+xml;charset=utf-8,')).toBe(true);
    expect(decodeURIComponent(uri.split(',')[1]!)).toContain('雾港来信');
  });
});

describe('Artwork Cache', () => {
  const req: ArtworkRequest = { mediaId: 'm1', kind: 'poster', size: 'md' };

  it('尺寸档位决定输出比例', () => {
    expect(artworkDimensions({ ...req, kind: 'poster', size: 'md' })).toEqual({ width: 213, height: 320, composition: 'poster' });
    expect(artworkDimensions({ ...req, kind: 'backdrop', size: 'md' }).composition).toBe('backdrop');
    expect(artworkDimensions({ ...req, size: 'xl' }).height).toBe(1280);
  });

  it('相同键命中缓存，rebuild 后重新解析', () => {
    rebuildArtworkCache();
    let calls = 0;
    const resolve = () => {
      calls += 1;
      return 'data:image/svg+xml,art';
    };
    const a = getArtwork(req, resolve);
    const b = getArtwork(req, resolve);
    expect(a).toBe(b);
    expect(calls).toBe(1);
    expect(cacheKey(req)).toBe('m1:poster:md');
    rebuildArtworkCache();
    expect(artworkCacheSize()).toBe(0);
    getArtwork(req, resolve);
    expect(calls).toBe(2);
  });
});
