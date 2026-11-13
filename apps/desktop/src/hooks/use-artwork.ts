import { useEffect, useState } from 'react';
import type { ArtworkRequest } from '@yingmu/media-models';
import { getBridge } from '@/lib/bridge';

/**
 * 通过 PlatformBridge 获取封面地址（真实实现由 Rust Artwork Cache 提供多尺寸缓存）。
 *
 * 不在这里「effect 开头 setSrc('')」：那属于在 effect 内同步 setState，
 * 会触发级联渲染（react-hooks/set-state-in-effect）。改为把结果与其 key 一起
 * 存入状态，渲染时按 key 比对派生返回值——依赖一变立即返回空，等异步结果回来再切换。
 */
export function useArtwork(mediaId: string, kind: ArtworkRequest['kind'], size: ArtworkRequest['size']): string {
  const key = `${mediaId}|${kind}|${size}`;
  const [loaded, setLoaded] = useState<{ key: string; src: string } | null>(null);

  useEffect(() => {
    let active = true;
    getBridge()
      .artworkGet({ mediaId, kind, size })
      .then((value) => {
        if (active) setLoaded({ key, src: value });
      })
      .catch(() => {
        if (active) setLoaded({ key, src: '' });
      });
    return () => {
      active = false;
    };
  }, [mediaId, kind, size, key]);

  return loaded?.key === key ? loaded.src : '';
}
