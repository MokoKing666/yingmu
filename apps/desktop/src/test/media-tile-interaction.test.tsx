/**
 * MediaTile 交互语义与键盘事件测试（任务书 4.2 / 4.3）。
 *
 * 关键约束：
 * - 磁贴容器不是 role=button（内部已有 Link + 两个 button，嵌套交互语义非法）；
 * - 主体 Enter 只打开一次详情，Space 只播放，F 只收藏；
 * - 收藏 / 播放按钮的 Enter、Space、点击都只做自己的事，不触发详情导航；
 * - 每个操作只执行一次（不重复触发）。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { MediaItem } from '@yingmu/media-models';
import { MediaTile } from '@/components/wall/MediaTile';
import type { MosaicTile } from '@/lib/wall-layout';

function item(patch: Partial<MediaItem> = {}): MediaItem {
  return {
    id: 'tile-1',
    kind: 'movie',
    sourceId: 'src',
    metadata: {
      title: '测试影片',
      directors: [],
      cast: [],
      writers: [],
      genres: ['剧情'],
      origin: 'none',
      year: 2026,
    },
    versions: [],
    favorite: false,
    addedAt: '2026-01-01T00:00:00Z',
    tags: [],
    ...patch,
  } as MediaItem;
}

function layout(): MosaicTile {
  return {
    mediaId: 'tile-1',
    order: 0,
    variant: 'portrait-lg',
    box: {
      x: 0,
      y: 0,
      width: 320,
      height: 420,
      aspect: 0.76,
      scale: 'portrait',
      emphasis: 0.5,
      objectPosition: '50% 40%',
    },
  } as unknown as MosaicTile;
}

interface HarnessProps {
  onPlay?: (item: MediaItem) => void;
  onToggleFavorite?: (id: string) => void;
  current?: MediaItem;
}

function Harness({ onPlay, onToggleFavorite, current = item() }: HarnessProps) {
  return (
    <MemoryRouter>
      <MediaTile
        item={current}
        layout={layout()}
        onPlay={onPlay ?? (() => {})}
        onToggleFavorite={onToggleFavorite ?? (() => {})}
      />
    </MemoryRouter>
  );
}

beforeEach(() => {
  localStorage.clear();
});

describe('磁贴交互结构', () => {
  it('容器是 article 而不是 role=button（消除嵌套交互语义）', () => {
    const { container } = render(<Harness />);
    const tile = container.querySelector('.tile');
    expect(tile?.tagName).toBe('ARTICLE');
    expect(tile?.getAttribute('role')).toBeNull();
  });

  it('主体导航是真正的 Link，可聚焦且有描述性无障碍名称', () => {
    render(<Harness />);
    const link = screen.getByRole('link', { name: /打开《测试影片》详情/ });
    expect(link).toHaveAttribute('href', '/detail/tile-1');
    expect(link.tabIndex).toBe(0);
  });

  it('收藏与播放是独立 button', () => {
    render(<Harness />);
    expect(screen.getByRole('button', { name: /收藏 测试影片/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /播放 测试影片/ })).toBeInTheDocument();
  });
});

describe('键盘操作每个只触发一次', () => {
  it('主体 Enter 导航到详情，且不触发播放/收藏', async () => {
    const user = userEvent.setup();
    const onPlay = vi.fn();
    const onToggleFavorite = vi.fn();
    render(<Harness onPlay={onPlay} onToggleFavorite={onToggleFavorite} />);
    const link = screen.getByRole('link', { name: /打开/ });
    link.focus();
    await user.keyboard('{Enter}');
    // Enter 交给 <a> 原生导航：我们的 onPlay / onToggleFavorite 都不应被调用
    expect(onPlay).not.toHaveBeenCalled();
    expect(onToggleFavorite).not.toHaveBeenCalled();
  });

  it('主体 Space 只播放一次，不打开详情', async () => {
    const user = userEvent.setup();
    const onPlay = vi.fn();
    const onToggleFavorite = vi.fn();
    render(<Harness onPlay={onPlay} onToggleFavorite={onToggleFavorite} />);
    const link = screen.getByRole('link', { name: /打开/ });
    link.focus();
    await user.keyboard(' ');
    expect(onPlay).toHaveBeenCalledTimes(1);
    expect(onToggleFavorite).not.toHaveBeenCalled();
  });

  it('主体 F 只收藏一次，不播放', async () => {
    const user = userEvent.setup();
    const onPlay = vi.fn();
    const onToggleFavorite = vi.fn();
    render(<Harness onPlay={onPlay} onToggleFavorite={onToggleFavorite} />);
    const link = screen.getByRole('link', { name: /打开/ });
    link.focus();
    await user.keyboard('f');
    expect(onToggleFavorite).toHaveBeenCalledTimes(1);
    expect(onToggleFavorite).toHaveBeenCalledWith('tile-1');
    expect(onPlay).not.toHaveBeenCalled();
  });

  it('收藏按钮 Enter 只收藏一次，不触发播放', async () => {
    const user = userEvent.setup();
    const onPlay = vi.fn();
    const onToggleFavorite = vi.fn();
    render(<Harness onPlay={onPlay} onToggleFavorite={onToggleFavorite} />);
    const fav = screen.getByRole('button', { name: /收藏 测试影片/ });
    fav.focus();
    await user.keyboard('{Enter}');
    expect(onToggleFavorite).toHaveBeenCalledTimes(1);
    expect(onPlay).not.toHaveBeenCalled();
  });

  it('收藏按钮 Space 只收藏一次，不触发播放', async () => {
    const user = userEvent.setup();
    const onPlay = vi.fn();
    const onToggleFavorite = vi.fn();
    render(<Harness onPlay={onPlay} onToggleFavorite={onToggleFavorite} />);
    const fav = screen.getByRole('button', { name: /收藏 测试影片/ });
    fav.focus();
    await user.keyboard(' ');
    expect(onToggleFavorite).toHaveBeenCalledTimes(1);
    expect(onPlay).not.toHaveBeenCalled();
  });

  it('播放按钮 Enter 只播放一次，不触发收藏', async () => {
    const user = userEvent.setup();
    const onPlay = vi.fn();
    const onToggleFavorite = vi.fn();
    render(<Harness onPlay={onPlay} onToggleFavorite={onToggleFavorite} />);
    const play = screen.getByRole('button', { name: /播放 测试影片/ });
    play.focus();
    await user.keyboard('{Enter}');
    expect(onPlay).toHaveBeenCalledTimes(1);
    expect(onToggleFavorite).not.toHaveBeenCalled();
  });

  it('播放按钮 Space 只播放一次，不触发收藏', async () => {
    const user = userEvent.setup();
    const onPlay = vi.fn();
    const onToggleFavorite = vi.fn();
    render(<Harness onPlay={onPlay} onToggleFavorite={onToggleFavorite} />);
    const play = screen.getByRole('button', { name: /播放 测试影片/ });
    play.focus();
    await user.keyboard(' ');
    expect(onPlay).toHaveBeenCalledTimes(1);
    expect(onToggleFavorite).not.toHaveBeenCalled();
  });

  it('点击收藏只收藏一次，点击播放只播放一次', async () => {
    const user = userEvent.setup();
    const onPlay = vi.fn();
    const onToggleFavorite = vi.fn();
    render(<Harness onPlay={onPlay} onToggleFavorite={onToggleFavorite} />);
    await user.click(screen.getByRole('button', { name: /收藏 测试影片/ }));
    await user.click(screen.getByRole('button', { name: /播放 测试影片/ }));
    expect(onToggleFavorite).toHaveBeenCalledTimes(1);
    expect(onPlay).toHaveBeenCalledTimes(1);
  });

  it('内部按钮的按键不会冒泡成磁贴主体操作', async () => {
    const user = userEvent.setup();
    const onPlay = vi.fn();
    const onToggleFavorite = vi.fn();
    render(<Harness onPlay={onPlay} onToggleFavorite={onToggleFavorite} />);
    const link = screen.getByRole('link', { name: /打开/ });
    const fav = screen.getByRole('button', { name: /收藏 测试影片/ });

    // 按钮上的 Space 不应冒泡到主体（否则会额外播放一次）
    fav.focus();
    await user.keyboard(' ');
    expect(onPlay).not.toHaveBeenCalled();
    // 直接对主体按 Space 才播放
    link.focus();
    await user.keyboard(' ');
    expect(onPlay).toHaveBeenCalledTimes(1);
  });

  it('收藏状态反映在按钮无障碍名称上', () => {
    const current = item({ favorite: true });
    render(<Harness current={current} />);
    expect(screen.getByRole('button', { name: /取消收藏 测试影片/ })).toBeInTheDocument();
  });
});
