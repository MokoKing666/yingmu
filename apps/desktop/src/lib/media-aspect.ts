import type { ArtworkRequest, MediaItem } from '@yingmu/media-models';

/**
 * 真实媒体的封面宽高比。
 *
 * 关键约束：**绝不能用 Media ID 哈希来决定真实媒体的比例**（v0.2 的缺陷：
 * TauriBridge 也走了 demoArtworkAspect）。这里的优先级是：
 * 1. 个人视频优先真实画幅（缩略图就是画面本身，不能被海报比例带偏）；
 * 2. 元数据里的真实海报尺寸（`posterAspect`，刮削或本地图片探测写入）；
 * 3. 其余按媒体类型给出合理回退。
 *
 * 返回值是连续数字，交给 Skyline 引擎直接使用，不做档位量化。
 */
export function mediaAspect(item: MediaItem): number {
  // 个人视频：真实画幅优先，绝不被海报比例劫持。
  // 接受任意有限正比例——极端画幅（如 1:3.4）由布局层统一钳制到 [0.4, 2.9]、
  // 显示层用 contain 留边；在输入层就改成 16:9 才是静默篡改画面。
  if (item.kind === 'personal') {
    const thumb = item.metadata.thumbnailAspect;
    if (typeof thumb === 'number' && Number.isFinite(thumb) && thumb > 0) return thumb;
    const video = item.versions[0]?.video;
    if (video?.width && video.height) {
      const ratio = video.width / video.height;
      if (Number.isFinite(ratio) && ratio > 0) return ratio;
    }
    return 16 / 9;
  }

  return validRatio(item.metadata.posterAspect) ?? (item.kind === 'documentary' ? 4 / 3 : 2 / 3);
}

/**
 * 某类素材自身的真实宽高比（海报 / 背景图 / 缩略图）。
 *
 * 与 `mediaAspect` 的区别：这里回答「这张**图片**是多少」，
 * 而 `mediaAspect` 回答「这块磁贴按什么比例排」。
 * 超大横幅应优先用 backdrop 的比例，竖版大海报用 poster 的比例，
 * 两者不能混用——否则竖版海报会被粗暴拉成超宽裁切。
 */
export function mediaArtworkAspect(item: MediaItem, kind: ArtworkRequest['kind']): number {
  const meta = item.metadata;
  switch (kind) {
    case 'backdrop':
      return (
        validRatio(meta.backdropAspect) ??
        validRatio(meta.posterAspect) ??
        videoRatio(item) ??
        16 / 9
      );
    case 'poster':
      return (
        validRatio(meta.posterAspect) ??
        validRatio(meta.backdropAspect) ??
        (item.kind === 'documentary' ? 4 / 3 : 2 / 3)
      );
    case 'thumbnail':
    default:
      return (
        validRatio(meta.thumbnailAspect) ??
        videoRatio(item) ??
        validRatio(meta.backdropAspect) ??
        1
      );
  }
}

/**
 * 图片放进磁贴时该用 cover 还是 contain。
 *
 * 个人视频默认 **contain**：磁贴几何由 Folia 布局决定，可能是 1.45:1 或 2:1，
 * 而视频是 16:9 / 4:3 / 21:9 —— 用 cover 会裁掉画面主体。
 * 海报 / 剧照默认 cover（磁贴裁切是设计意图），配合 focal point 控制焦点。
 */
export function artworkFit(item: MediaItem): 'cover' | 'contain' {
  return item.kind === 'personal' ? 'contain' : 'cover';
}

/** 比例必须是有限值且在可用区间内；越界/NaN 一律视为缺失 */
function validRatio(value: number | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0.3 && value <= 4
    ? value
    : undefined;
}

function videoRatio(item: MediaItem): number | undefined {
  const video = item.versions[0]?.video;
  if (video?.width && video.height) {
    return validRatio(video.width / video.height);
  }
  return undefined;
}
