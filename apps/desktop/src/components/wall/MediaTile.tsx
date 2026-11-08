import { memo } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { useMotionPreference } from '@/hooks/use-motion-preference';
import { Heart, Play, GripVertical } from 'lucide-react';
import type { KeyboardEvent, MouseEvent } from 'react';
import type { ArtworkRequest, MediaId, MediaItem } from '@yingmu/media-models';
import { LazyImage } from '@/components/ui/LazyImage';
import { useArtwork } from '@/hooks/use-artwork';
import { formatClock, formatDuration, KIND_LABEL, truncate } from '@/lib/format';
import { artworkFit } from '@/lib/media-aspect';
import { motion as motionTokens } from '@yingmu/design-tokens';
import type { MosaicTile } from '@/lib/wall-layout';

interface MediaTileProps {
  item: MediaItem;
  layout: MosaicTile;
  focused?: boolean;
  dragging?: boolean;
  dropTarget?: boolean;
  onFocus?: () => void;
  onPlay?: (item: MediaItem) => void;
  onToggleFavorite?: (id: MediaId) => void;
}

/**
 * 图片类型：个人视频永远用缩略图（真实画面）；
 * 其余按磁贴几何比例选海报 / 背景图——超大横幅优先 backdrop，竖版优先 poster。
 */
function artworkKind(item: MediaItem, aspect: number): ArtworkRequest['kind'] {
  if (item.kind === 'personal') return 'thumbnail';
  if (aspect >= 1.35) return 'backdrop';
  if (aspect <= 0.85) return 'poster';
  return 'thumbnail';
}

/** 按渲染面积选择缓存档位：大磁贴请求大图，小磁贴只用缩略图 */
function artworkSize(width: number): ArtworkRequest['size'] {
  if (width > 900) return 'xl';
  if (width > 520) return 'lg';
  if (width > 260) return 'md';
  return 'sm';
}

/**
 * 单个磁贴。外层 `.mosaic-slot` 负责绝对定位与重排过渡，
 * 本层只负责入场 / 悬停 / 共享元素转场，避免 Motion 的 scale 与定位 transform 冲突。
 */
export const MediaTile = memo(function MediaTile({
  item,
  layout,
  focused = false,
  dragging = false,
  dropTarget = false,
  onFocus,
  onPlay,
  onToggleFavorite,
}: MediaTileProps) {
  const reduceMotion = useMotionPreference();
  const box = layout.box;
  const src = useArtwork(item.id, artworkKind(item, box.aspect), artworkSize(box.width));
  const fit = artworkFit(item);
  const version = item.versions[0];
  const hdr = version?.video?.hdrFormat;
  const isDv = hdr === 'dolby-vision';
  const duration = version?.durationSeconds ?? 0;
  const progress = item.resumeSeconds && duration ? (item.resumeSeconds / duration) * 100 : 0;
  // 层次化入场延迟：同一屏内按排序位置错开，但封顶避免长列表末尾迟滞
  const enterDelay = Math.min(0.32, (layout.order % 14) * 0.022);

  /**
   * 磁贴主体的键盘操作挂在真正的 <Link> 上（不是 role=button 的容器）：
   *  - Enter：由 <a> 原生行为打开详情，只导航一次；
   *  - Space：播放；
   *  - F：收藏。
   * 内部按钮有自己的 Enter/Space 处理（stopPropagation），不会冒泡到主体。
   */
  const onLinkKeyDown = (event: KeyboardEvent<HTMLAnchorElement>) => {
    if (event.key === ' ') {
      event.preventDefault();
      onPlay?.(item);
    } else if (event.key === 'f' || event.key === 'F') {
      event.preventDefault();
      onToggleFavorite?.(item.id);
    }
  };

  /** 按钮上按 Enter/Space 只做按钮自己的事，不再触发磁贴主体的导航/播放 */
  const stopInnerKey = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === ' ' || event.key === 'Enter') {
      event.stopPropagation();
    }
  };

  const onFavoriteClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    onToggleFavorite?.(item.id);
  };

  const onPlayClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    onPlay?.(item);
  };

  return (
    <motion.article
      layout={!reduceMotion}
      layoutId={reduceMotion ? undefined : `tile-${item.id}`}
      className="tile"
      data-variant={layout.variant}
      data-scale={box.scale}
      data-focused={focused}
      data-dragging={dragging}
      data-drop-target={dropTarget}
      data-testid={`tile-${item.id}`}
      initial={reduceMotion ? false : { opacity: 0, scale: 0.965 }}
      animate={reduceMotion ? undefined : { opacity: 1, scale: 1 }}
      whileHover={reduceMotion ? undefined : { scale: motionTokens.hoverScale }}
      transition={reduceMotion ? { duration: 0 } : { ...motionTokens.spring, delay: enterDelay }}
      draggable
      aria-label={`${item.metadata.title}，${KIND_LABEL[item.kind]}，${item.metadata.year ?? '年份未知'}`}
      onFocus={onFocus}
    >
      {/* 主体导航是真正的 <Link>：覆盖整块磁贴，可聚焦、可见焦点环；
          内部按钮叠在它上面，因此点收藏 / 播放不会触发详情导航。 */}
      <Link
        className="tile-link"
        to={`/detail/${item.id}`}
        aria-label={`打开《${item.metadata.title}》详情（Enter 详情，Space 播放，F 收藏）`}
        onKeyDown={onLinkKeyDown}
      />
      {src ? (
        <LazyImage
          className="tile-art"
          src={src}
          alt={`${item.metadata.title} 封面`}
          style={{ objectPosition: fit === 'cover' ? box.objectPosition : '50% 50%' }}
          data-fit={fit}
        />
      ) : (
        <span className="tile-art-placeholder" aria-hidden="true" />
      )}
      <span className="tile-scrim" />

      <div className="tile-badges">
        <span className="tile-badge">{KIND_LABEL[item.kind]}</span>
        {item.metadata.year && <span className="tile-badge">{item.metadata.year}</span>}
        {isDv && <span className="tile-badge">DV 标识</span>}
        {hdr === 'hdr10' && <span className="tile-badge">HDR10 标识</span>}
        {item.favorite && <span className="tile-badge tile-badge-accent">收藏</span>}
      </div>

      <div className="tile-actions">
        <button
          type="button"
          className="tile-action"
          data-on={item.favorite}
          title={item.favorite ? '取消收藏' : '加入收藏'}
          aria-label={item.favorite ? `取消收藏 ${item.metadata.title}` : `收藏 ${item.metadata.title}`}
          onClick={onFavoriteClick}
          onKeyDown={stopInnerKey}
        >
          <Heart size={14} fill={item.favorite ? 'currentColor' : 'none'} />
        </button>
        <button
          type="button"
          className="tile-action"
          title="播放"
          aria-label={`播放 ${item.metadata.title}`}
          onClick={onPlayClick}
          onKeyDown={stopInnerKey}
        >
          <Play size={14} fill="currentColor" />
        </button>
        {/* 拖拽手柄是装饰性提示：整块磁贴都可拖，手柄不单独接收交互 */}
        <span className="tile-action" title="拖动以排序" aria-hidden="true" style={{ cursor: 'grab' }}>
          <GripVertical size={14} />
        </span>
      </div>

      {layout.variant === 'resume' && item.resumeSeconds != null && (
        <>
          <span className="tile-progress-label">
            续播 {formatClock(item.resumeSeconds)} / {formatClock(duration)}
          </span>
          <div className="tile-progress">
            <span style={{ width: `${Math.min(100, progress)}%` }} />
          </div>
        </>
      )}

      <div className="tile-content">
        <h3 className="tile-title">{item.metadata.title}</h3>
        <p className="tile-sub">
          {box.scale === 'ultra-wide' || box.emphasis > 0.82
            ? truncate(item.metadata.synopsis || '', 88)
            : `${item.metadata.year ?? '—'} · ${KIND_LABEL[item.kind]} · ${formatDuration(duration)}`}
        </p>
      </div>
    </motion.article>
  );
});
