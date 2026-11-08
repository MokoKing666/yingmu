import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DragEvent, KeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { mosaic as mosaicTokens } from '@yingmu/design-tokens';
import type { MediaId, MediaItem } from '@yingmu/media-models';
import { MediaTile } from './MediaTile';
import { EmptyState } from '@/components/ui/EmptyState';
import { useAppStore } from '@/stores/app-store';
import { computeMosaicLayout } from '@/lib/wall-layout';
import type { MosaicTile } from '@/lib/wall-layout';
import { demoArtworkAspect } from '@/lib/demo-artwork';
import { mediaAspect } from '@/lib/media-aspect';
import { SCOPE_HOME, toOrderMap } from '@/lib/layout-preferences';

interface MasonryWallProps {
  items: MediaItem[];
  /**
   * 布局作用域（home / library:movie / …）。拖拽结果只写入这个作用域，
   * 不同页面的自定义排列互不影响。
   */
  scope?: string;
  /**
   * 当前排序模式。只有 `custom` 才应用自定义排列；
   * 其余模式一律尊重 `items` 的给定顺序，绝不被全局 customOrder 覆盖。
   */
  sortMode?: 'recommended' | 'recent' | 'year' | 'rating' | 'title' | 'custom';
  heroEnabled?: boolean;
  showToolbar?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
}

interface ViewRange {
  top: number;
  bottom: number;
}

function tileIdFromEvent(event: DragEvent<HTMLDivElement>): MediaId | undefined {
  const target = event.target as HTMLElement | null;
  return target?.closest<HTMLElement>('[data-media-id]')?.dataset.mediaId;
}

/**
 * Folia 式全幅拼贴画布。
 *
 * - 布局由 `computeMosaicLayout` 输出绝对像素坐标，容器高度固定为 canvasHeight；
 * - **真正的可见区域虚拟化**：按滚动位置 + overscan 过滤磁贴，仅挂载可见项，
 *   不再逐批追加 DOM；1000 条数据时 DOM 数量仍与视口大小同阶；
 * - ResizeObserver + rAF 合并宽度变化，滚动区间按 160px 台阶量化，避免频繁重渲染；
 * - 拖拽期间只更新高亮状态，布局 memo 不会重算，落点提交时才写 customOrder。
 */
export function MasonryWall({
  items,
  scope = SCOPE_HOME,
  sortMode = 'recommended',
  heroEnabled = true,
  showToolbar = false,
  emptyTitle = '这里还没有内容',
  emptyDescription,
}: MasonryWallProps) {
  const navigate = useNavigate();
  const layoutPref = useAppStore((s) => s.layoutPrefs[scope]);
  const focalOverrides = useAppStore((s) => s.focalOverrides);
  const setWallOrder = useAppStore((s) => s.setWallOrder);
  const toggleFavorite = useAppStore((s) => s.toggleFavorite);
  const isDemo = useAppStore((s) => s.isDemo);

  // 只有自定义模式才应用自定义序号；其余模式完全尊重调用方给的顺序。
  // 这是「页面排序不被全局 customOrder 覆盖」的关键。
  const customOrder = useMemo(
    () => (sortMode === 'custom' ? toOrderMap(layoutPref?.orderedMediaIds ?? []) : undefined),
    [sortMode, layoutPref],
  );

  const [canvasWidth, setCanvasWidth] = useState(1440);
  const [viewRange, setViewRange] = useState<ViewRange>({ top: 0, bottom: 1800 });
  const [draggingId, setDraggingId] = useState<MediaId | undefined>();
  const [dropTargetId, setDropTargetId] = useState<MediaId | undefined>();
  const [focusedId, setFocusedId] = useState<MediaId | undefined>();
  const containerRef = useRef<HTMLDivElement | null>(null);

  const layout = useMemo(
    () =>
      computeMosaicLayout(items, {
        canvasWidth,
        customOrder,
        heroEnabled,
        // 演示桥接用原创素材的真实比例；桌面模式用真实海报/视频元数据，
        // 绝不再用 Media ID 哈希决定真实媒体的显示比例。
        aspectResolver: (item) => (isDemo ? demoArtworkAspect(item.id) : mediaAspect(item)),
        // 个人视频必须保留真实画幅，不参与 Folia 的比例分档
        preserveAspect: (item) => item.kind === 'personal',
        focalResolver: (item) => focalOverrides[item.id],
      }),
    [items, canvasWidth, customOrder, heroEnabled, focalOverrides, isDemo],
  );

  const itemById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const orderedIds = useMemo(() => layout.tiles.map((t) => t.mediaId), [layout.tiles]);

  /** 只挂载与当前视口（含 overscan）相交的磁贴 */
  const visible = useMemo(
    () =>
      layout.tiles.filter(
        (tile) =>
          tile.box.y + tile.box.height >= viewRange.top && tile.box.y <= viewRange.bottom,
      ),
    [layout.tiles, viewRange],
  );

  // 画布宽度测量：ResizeObserver 回调合并到一帧，避免 resize 风暴
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let frame = 0;
    const measure = () => {
      const width = Math.round(el.clientWidth);
      if (width > 0) setCanvasWidth((prev) => (Math.abs(prev - width) > 2 ? width : prev));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    });
    observer.observe(el);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);

  // 可见区间跟踪：滚动事件 passive + rAF，区间量化后只在跨台阶时 setState
  useEffect(() => {
    const el = containerRef.current;
    const scrollEl = document.getElementById('page-scroll');
    if (!el || !scrollEl) return;
    let frame = 0;
    let lastTop = Number.NaN;

    const measure = () => {
      const wallTop = el.getBoundingClientRect().top;
      const scrollTop = scrollEl.getBoundingClientRect().top;
      const offset = wallTop - scrollTop + scrollEl.scrollTop;
      const top = scrollEl.scrollTop - offset - mosaicTokens.overscan;
      const bottom = scrollEl.scrollTop + scrollEl.clientHeight - offset + mosaicTokens.overscan;
      const quantised = Math.floor(top / 160) * 160;
      if (Number.isNaN(lastTop) || Math.abs(quantised - lastTop) >= 160) {
        lastTop = quantised;
        setViewRange({ top: quantised, bottom: bottom + 160 });
      }
    };
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    measure();
    scrollEl.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      cancelAnimationFrame(frame);
      scrollEl.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [layout.canvasHeight, canvasWidth]);

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
        // 只写入当前作用域，并把该作用域切到「自定义排列」模式
        void setWallOrder(scope, reordered);
      }
      setDraggingId(undefined);
      setDropTargetId(undefined);
    },
    [draggingId, orderedIds, scope, setWallOrder],
  );

  /**
   * 键盘焦点与虚拟化的竞态修复：
   * 目标磁贴可能尚未挂载，不能「滚动后立刻查 DOM」；改为记下待聚焦 id，
   * 由 visible 变化触发的 effect 在节点真正出现后再 focus（不在 effect 内 setState）。
   */
  const pendingFocusRef = useRef<MediaId | null>(null);

  const focusPending = useCallback(() => {
    const id = pendingFocusRef.current;
    if (!id) return;
    const node = containerRef.current?.querySelector<HTMLElement>(
      `[data-media-id="${id}"] .tile`,
    );
    if (node) {
      node.focus();
      pendingFocusRef.current = null;
    }
  }, []);

  useEffect(() => {
    focusPending();
  }, [visible, focusPending]);

  const focusTile = useCallback(
    (tile: MosaicTile | undefined) => {
      if (!tile) return;
      const scrollEl = document.getElementById('page-scroll');
      if (scrollEl && containerRef.current) {
        const offset =
          containerRef.current.getBoundingClientRect().top -
          scrollEl.getBoundingClientRect().top +
          scrollEl.scrollTop;
        const viewTop = scrollEl.scrollTop - offset;
        const viewBottom = viewTop + scrollEl.clientHeight;
        if (tile.box.y < viewTop || tile.box.y > viewBottom) {
          scrollEl.scrollTo({ top: offset + tile.box.y - 120, behavior: 'smooth' });
        }
      }
      setFocusedId(tile.mediaId);
      pendingFocusRef.current = tile.mediaId;
      focusPending();
    },
    [focusPending],
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      const key = event.key;
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(key)) return;
      event.preventDefault();
      if (layout.tiles.length === 0) return;
      if (key === 'Home') {
        focusTile(layout.tiles[0]);
        return;
      }
      if (key === 'End') {
        focusTile(layout.tiles[layout.tiles.length - 1]);
        return;
      }

      const current = layout.tiles.find((t) => t.mediaId === focusedId) ?? layout.tiles[0]!;
      const cx = current.box.x + current.box.width / 2;
      const cy = current.box.y + current.box.height / 2;
      let best: MosaicTile | undefined;
      let bestScore = Number.POSITIVE_INFINITY;

      for (const tile of layout.tiles) {
        if (tile.mediaId === current.mediaId) continue;
        const dx = tile.box.x + tile.box.width / 2 - cx;
        const dy = tile.box.y + tile.box.height / 2 - cy;
        const horizontal = key === 'ArrowLeft' || key === 'ArrowRight';
        const primary = horizontal ? dx : dy;
        const secondary = horizontal ? dy : dx;
        const forward = key === 'ArrowRight' || key === 'ArrowDown' ? 1 : -1;
        if (primary * forward <= 0) continue;
        const tolerance = horizontal ? 320 : 420;
        if (Math.abs(secondary) > tolerance) continue;
        const score = Math.abs(primary) + Math.abs(secondary) * 1.6;
        if (score < bestScore) {
          bestScore = score;
          best = tile;
        }
      }
      if (!best) {
        const step = key === 'ArrowRight' || key === 'ArrowDown' ? 1 : -1;
        const nextIndex = Math.min(
          layout.tiles.length - 1,
          Math.max(0, current.order + step),
        );
        best = layout.tiles[nextIndex];
      }
      focusTile(best);
    },
    [focusedId, layout.tiles, focusTile],
  );

  if (items.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />;
  }

  return (
    <div className="wall-stage">
      {showToolbar && (
        <div className="wall-toolbar">
          <span>
            {items.length} 项 · 当前挂载 {visible.length} 项 · 画布 {layout.canvasWidth}×{layout.canvasHeight}
          </span>
          <span>
            <kbd>←</kbd> <kbd>→</kbd> 导航 · <kbd>Enter</kbd> 详情 · <kbd>Space</kbd> 播放 · <kbd>F</kbd> 收藏 · 拖动排序
          </span>
        </div>
      )}

      <div
        ref={containerRef}
        className="mosaic"
        data-testid="mosaic-canvas"
        data-canvas-width={layout.canvasWidth}
        data-canvas-height={layout.canvasHeight}
        data-total={items.length}
        data-mounted={visible.length}
        style={{ height: layout.canvasHeight }}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onDragEnd={() => {
          setDraggingId(undefined);
          setDropTargetId(undefined);
        }}
        onKeyDown={handleKeyDown}
      >
        {visible.map((tile) => {
          const item = itemById.get(tile.mediaId);
          if (!item) return null;
          return (
            <div
              key={tile.mediaId}
              className="mosaic-slot"
              data-media-id={tile.mediaId}
              data-scale={tile.box.scale}
              style={{
                transform: `translate3d(${tile.box.x}px, ${tile.box.y}px, 0)`,
                width: tile.box.width,
                height: tile.box.height,
              }}
            >
              <MediaTile
                item={item}
                layout={tile}
                focused={focusedId === tile.mediaId}
                dragging={draggingId === tile.mediaId}
                dropTarget={dropTargetId === tile.mediaId}
                onFocus={() => setFocusedId(tile.mediaId)}
                onToggleFavorite={(id) => void toggleFavorite(id)}
                onPlay={(media) => navigate(`/player/${media.id}`)}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
