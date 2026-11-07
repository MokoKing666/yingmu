import { useEffect, useState } from 'react';
import type { ArtworkRequest } from '@yingmu/media-models';
import { getBridge } from '@/lib/bridge';

/** 通过 PlatformBridge 获取封面地址（真实实现由 Rust Artwork Cache 提供多尺寸缓存） */
export function useArtwork(mediaId: string, kind: ArtworkRequest['kind'], size: ArtworkRequest['size']): string {
  const [src, setSrc] = useState('');

  useEffect(() => {
    let active = true;
    setSrc('');
    getBridge()
      .artworkGet({ mediaId, kind, size })
      .then((value) => {
        if (active) setSrc(value);
      })
      .catch(() => {
        if (active) setSrc('');
      });
    return () => {
      active = false;
    };
  }, [mediaId, kind, size]);

  return src;
}
