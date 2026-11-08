import type { MediaItem } from '@yingmu/media-models';

/**
 * 真实媒体的封面宽高比。
 *
 * 关键约束：**绝不能用 Media ID 哈希来决定真实媒体的比例**（v0.2 的缺陷：
 * TauriBridge 也走了 demoArtworkAspect）。这里的优先级是：
 * 1. 元数据里的真实海报尺寸（`posterAspect`，刮削或本地图片探测写入）；
 * 2. 个人视频用视频画面的真实宽高比（缩略图就是画面本身）；
 * 3. 其余按媒体类型给出合理回退。
 *
 * 返回值是连续数字，交给 Skyline 引擎直接使用，不做档位量化。
 */
export function mediaAspect(item: MediaItem): number {
  const posterAspect = item.metadata.posterAspect;
  if (typeof posterAspect === 'number' && posterAspect >= 0.3 && posterAspect <= 3.5) {
    return posterAspect;
  }

  if (item.kind === 'personal') {
    const video = item.versions[0]?.video;
    if (video?.width && video.height) {
      const ratio = video.width / video.height;
      if (ratio >= 0.3 && ratio <= 3.5) return ratio;
    }
    return 16 / 9;
  }

  switch (item.kind) {
    case 'documentary':
      return 4 / 3;
    default:
      // 电影 / 剧集 / 动画：竖版海报是业界默认
      return 2 / 3;
  }
}
