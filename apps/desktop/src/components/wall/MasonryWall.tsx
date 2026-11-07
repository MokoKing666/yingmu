import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DragEvent, KeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { MediaTile } from './MediaTile';
import { EmptyState } from '@/components/ui/EmptyState';
import { useAppStore } from '@/stores/app-store';
import { computeWallLayout } from '@/lib/wall-layout';
import type { MediaId, MediaItem } from '@yingmu/media-models';

const BATCH_SIZE = 24;

interface MasonryWallProps {
  items: MediaItem[];
  heroEnabled?: boolean;
  showToolbar?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
}

function tileIdFromEvent(event: DragEvent<HTMLDivElement>): MediaId | undefined {
  const target = event.target as HTMLElement | null;
  return target?.closest<HTMLElement>('[data-media-id]')?.dataset.mediaId;
}

/**
 * Folia 式不规则磁贴幕墙
 * - dense 12 列网格，尺寸层次由 wall-layout 纯函数决定
 * - 分批增量渲染（每批 24）+ IntersectionObserver 封面懒加载 + 浏览器 content-visibility
 * - HTML5 拖拽排序（容器事件委托）、键盘方向导航、共享元素转场（layoutId）
 */
export function MasonryWall({
  items,
  heroEnabled = true,
  showToolbar = true,
  emptyTitle = '这里还没有内容',
  emptyDescription,
}: MasonryWallProps) {
  const navigate = useNavigate();
  const customOrder = useAppStore((s) => s.customOrder);
  const setWallOrder = useAppStore((s) => s.setWallOrder);
  const toggleFavorite = useAppStore((s) => s.toggleFavorite);

  const [visibleCount, setVisibleCount] = useState(BATCH_SIZE);
  const [draggingId, setDraggingId] = useState<MediaId | undefined>();
  const [dropTargetId, setDropTargetId] = useState<MediaId | undefined>();
  const [focusedId, setFocusedId] = useState<MediaId | undefined>();
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const layouts = useMemo(
    () => computeWallLayout(items, { customOrder, heroEnabled }),
    [items, customOrder, heroEnabled],
  );

  const orderedIds = useMemo(() => layouts.map((l) => l.mediaId), [layouts]);
  const itemById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const shown = layouts.slice(0, visibleCount);

  useEffect(() => {
    setVisibleCount(BATCH_SIZE);
  }, [items.length]);

  // 触底增量渲染：每次追加一批，避免一次性挂载上千张封面
  useEffect(() => {
    const element = sentinelRef.current;
    if (!element || visibleCount >= items.length) return;
    if (typeof IntersectionObserver === 'undefined') {
      setVisibleCount(items.length);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisibleCount((count) => Math.min(items.length, count + BATCH_SIZE));
        }
      },
      { rootMargin: '700px' },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [items.length, visibleCount]);

  const handleDragStart = useCallback((event: DragEvent<HTMLDivElement>) => {
    const id = tileIdFromEvent(event);
    if (!id) return;
    event.dataTransfer.setData('text/plain', id);
    event.dataTransfer.effectAllowed = 'move';
    setDraggingId(id);
  }, []);

  const handleDragOver = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      const id = tileIdFromEvent(event);
      if (id && id !== dropTargetId) setDropTargetId(id);
    },
    [dropTargetId],
  );

  const handleDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      const targetId = tileIdFromEvent(event);
      const sourceId = event.dataTransfer.getData('text/plain') || draggingId;
      if (!sourceId || !targetId || sourceId === targetId) {
        setDraggingId(undefined);
        setDropTargetId(undefined);
        return;
      }
      const from = orderedIds.indexOf(sourceId);
      const to = orderedIds.indexOf(targetId);
      if (from >= 0 && to >= 0) {
        const reordered = [...orderedIds];
        reordered.splice(from, 1);
        reordered.splice(to, 0, sourceId);
        setWallOrder(reordered);
      }
      setDraggingId(undefined);
      setDropTargetId(undefined);
    },
    [draggingId, orderedIds, setWallOrder],
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      const key = event.key;
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(key)) return;
      event.preventDefault();
      const tiles = Array.from(containerRef.current?.querySelectorAll<HTMLElement>('.tile') ?? []);
      if (tiles.length === 0) return;
      const current = tiles.findIndex((tile) => tile.dataset.mediaId === focusedId);
      const step = key === 'ArrowLeft' || key === 'ArrowUp' ? -1 : 1;
      let next = 0;
      if (key === 'Home') next = 0;
      else if (key === 'End') next = tiles.length - 1;
      else if (current < 0) next = 0;
      else next = Math.min(tiles.length - 1, Math.max(0, current + step));
      const target = tiles[next];
      target?.focus();
      setFocusedId(target?.dataset.mediaId);
    },
    [focusedId],
  );

  if (items.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />;
  }

  return (
    <div className="wall-stage">
      {showToolbar && (
        <div className="wall-toolbar">
          <span>
            共 {items.length} 项 · 已渲染 {shown.length} 项 · 拖动磁贴可自定义排列
          </span>
          <span>
            <kbd>←</kbd> <kbd>→</kbd> 导航 · <kbd>Enter</kbd> 详情 · <kbd>Space</kbd> 播放 · <kbd>F</kbd> 收藏
          </span>
        </div>
      )}

      <div
        ref={containerRef}
        className="wall"
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onDragEnd={() => {
          setDraggingId(undefined);
          setDropTargetId(undefined);
        }}
        onKeyDown={handleKeyDown}
      >
        {shown.map((layout) => {
          const item = itemById.get(layout.mediaId);
          if (!item) return null;
          return (
            <MediaTile
              key={layout.mediaId}
              item={item}
              layout={layout}
              focused={focusedId === layout.mediaId}
              dragging={draggingId === layout.mediaId}
              dropTarget={dropTargetId === layout.mediaId}
              onFocus={() => setFocusedId(layout.mediaId)}
              onToggleFavorite={(id) => void toggleFavorite(id)}
              onPlay={(media) => navigate(`/player/${media.id}`)}
            />
          );
        })}
      </div>

      {visibleCount < items.length && <div ref={sentinelRef} style={{ height: 1 }} aria-hidden="true" />}
    </div>
  );
}
