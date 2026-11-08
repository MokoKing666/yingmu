import { memo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { Heart, Play, GripVertical } from 'lucide-react';
import type { KeyboardEvent } from 'react';
import type { ArtworkRequest, MediaId, MediaItem } from '@yingmu/media-models';
import { LazyImage } from '@/components/ui/LazyImage';
import { useArtwork } from '@/hooks/use-artwork';
import { formatClock, formatDuration, KIND_LABEL, truncate } from '@/lib/format';
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

/** 图片类型由磁贴实际宽高比决定（连续值），而不是六种固定枚举 */
function artworkKind(aspect: number): ArtworkRequest['kind'] {
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
  const navigate = useNavigate();
  const box = layout.box;
  const src = useArtwork(item.id, artworkKind(box.aspect), artworkSize(box.width));
  const version = item.versions[0];
  const hdr = version?.video?.hdrFormat;
  const isDv = hdr === 'dolby-vision';
  const duration = version?.durationSeconds ?? 0;
  const progress = item.resumeSeconds && duration ? (item.resumeSeconds / duration) * 100 : 0;
  // 层次化入场延迟：同一屏内按排序位置错开，但封顶避免长列表末尾迟滞
  const enterDelay = Math.min(0.32, (layout.order % 14) * 0.022);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      navigate(`/detail/${item.id}`);
    } else if (event.key === ' ') {
      event.preventDefault();
      onPlay?.(item);
    } else if (event.key === 'f' || event.key === 'F') {
      onToggleFavorite?.(item.id);
    }
  };

  return (
    <motion.div
      layoutId={`tile-${item.id}`}
      className="tile"
      data-variant={layout.variant}
      data-scale={box.scale}
      data-focused={focused}
      data-dragging={dragging}
      data-drop-target={dropTarget}
      data-testid={`tile-${item.id}`}
      initial={{ opacity: 0, scale: 0.965 }}
      animate={{ opacity: 1, scale: 1 }}
      whileHover={{ scale: motionTokens.hoverScale }}
      transition={{ ...motionTokens.spring, delay: enterDelay }}
      draggable
      tabIndex={0}
      role="button"
      aria-label={`${item.metadata.title}，${KIND_LABEL[item.kind]}，${item.metadata.year ?? '年份未知'}`}
      onFocus={onFocus}
      onKeyDown={onKeyDown}
    >
      <Link className="tile-link" to={`/detail/${item.id}`} tabIndex={-1} aria-hidden="true" />
      {src ? (
        <LazyImage
          className="tile-art"
          src={src}
          alt={`${item.metadata.title} 封面`}
          style={{ objectPosition: box.objectPosition }}
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
          className="tile-action"
          data-on={item.favorite}
          title={item.favorite ? '取消收藏' : '加入收藏'}
          aria-label={item.favorite ? '取消收藏' : '加入收藏'}
          onClick={(event) => {
            event.preventDefault();
            onToggleFavorite?.(item.id);
          }}
        >
          <Heart size={14} fill={item.favorite ? 'currentColor' : 'none'} />
        </button>
        <button
          className="tile-action"
          title="播放"
          aria-label={`播放 ${item.metadata.title}`}
          onClick={(event) => {
            event.preventDefault();
            onPlay?.(item);
          }}
        >
          <Play size={14} fill="currentColor" />
        </button>
        <span className="tile-action" title="拖动以排序" style={{ cursor: 'grab' }}>
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
    </motion.div>
  );
});
