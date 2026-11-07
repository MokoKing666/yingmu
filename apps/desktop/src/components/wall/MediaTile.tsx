import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { Heart, Play, GripVertical } from 'lucide-react';
import type { CSSProperties, KeyboardEvent } from 'react';
import type { ArtworkRequest, MediaId, MediaItem, TileLayout } from '@yingmu/media-models';
import { LazyImage } from '@/components/ui/LazyImage';
import { useArtwork } from '@/hooks/use-artwork';
import { formatClock, formatDuration, KIND_LABEL, truncate } from '@/lib/format';
import { motion as motionTokens } from '@yingmu/design-tokens';

interface MediaTileProps {
  item: MediaItem;
  layout: TileLayout;
  focused?: boolean;
  dragging?: boolean;
  dropTarget?: boolean;
  onFocus?: () => void;
  onPlay?: (item: MediaItem) => void;
  onToggleFavorite?: (id: MediaId) => void;
}

function artworkKind(variant: TileLayout['variant']): ArtworkRequest['kind'] {
  return variant === 'hero' || variant === 'wide' || variant === 'resume' ? 'backdrop' : 'poster';
}

function artworkSize(variant: TileLayout['variant']): ArtworkRequest['size'] {
  return variant === 'hero' ? 'xl' : variant === 'wide' ? 'lg' : 'md';
}

/**
 * 单个磁贴。拖拽事件由 MasonryWall 在容器上委托处理，
 * 这样 Motion 的布局动画与 HTML5 drag 不会互相干扰。
 */
export function MediaTile({
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
  const src = useArtwork(item.id, artworkKind(layout.variant), artworkSize(layout.variant));
  const version = item.versions[0];
  const hdr = version?.video?.hdrFormat;
  const isDv = hdr === 'dolby-vision';
  const duration = version?.durationSeconds ?? 0;
  const progress = item.resumeSeconds && duration ? (item.resumeSeconds / duration) * 100 : 0;

  const style = {
    '--col-span': layout.colSpan,
    '--row-span': layout.rowSpan,
  } as CSSProperties;

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
      layout
      layoutId={`tile-${item.id}`}
      className="tile"
      data-variant={layout.variant}
      data-media-id={item.id}
      data-focused={focused}
      data-dragging={dragging}
      data-drop-target={dropTarget}
      data-testid={`tile-${item.id}`}
      style={style}
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ scale: motionTokens.hoverScale, y: motionTokens.hoverLift }}
      transition={motionTokens.spring}
      draggable
      tabIndex={0}
      role="button"
      aria-label={`${item.metadata.title}，${KIND_LABEL[item.kind]}，${item.metadata.year ?? '年份未知'}`}
      onFocus={onFocus}
      onKeyDown={onKeyDown}
    >
      <Link className="tile-link" to={`/detail/${item.id}`} tabIndex={-1} aria-hidden="true" />
      {src ? (
        <LazyImage className="tile-art" src={src} alt={`${item.metadata.title} 封面`} />
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
          {layout.variant === 'hero'
            ? truncate(item.metadata.synopsis || '', 76)
            : `${item.metadata.year ?? '—'} · ${KIND_LABEL[item.kind]} · ${formatDuration(duration)}`}
        </p>
      </div>
    </motion.div>
  );
}
