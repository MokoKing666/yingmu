/**
 * 布局偏好持久化失败的状态一致性测试（任务书 10）。
 *
 * 用 mock 桥接模拟 IPC 写入失败 / 慢返回，验证：
 *  - 写入成功 → 状态与持久化一致；
 *  - 写入失败 → 回滚到保存前状态并给出失败 Toast（不显示虚假成功）；
 *  - 快速连续两次写入：旧请求失败不得回滚新操作；
 *  - 同一作用域串行化（第二次写入等第一次完成）；不同作用域互不阻塞。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useAppStore } from '@/stores/app-store';
import type { LayoutPreferences, MediaItem } from '@yingmu/media-models';

const bridge = vi.hoisted(() => ({
  layoutSet: vi.fn(),
}));

vi.mock('@/lib/bridge', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/bridge')>();
  return {
    ...actual,
    getBridge: () => ({
      layoutGet: vi.fn(),
      layoutSet: bridge.layoutSet,
    }),
  };
});

const SCOPE = 'library:movie';

/** setWallOrder 会按「已知媒体」过滤 ID，测试里先种上会用到的条目 */
function item(id: string): MediaItem {
  return {
    id,
    kind: 'movie',
    sourceId: 'src',
    metadata: { title: id, directors: [], cast: [], writers: [], genres: [], origin: 'none' },
    versions: [],
    favorite: false,
    addedAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    playCount: 0,
    tags: [],
  } as unknown as MediaItem;
}

function seededPrefs(): LayoutPreferences {
  return {
    scope: SCOPE,
    sortMode: 'rating',
    orderedMediaIds: ['x1', 'x2', 'x3'],
    updatedAt: '2026-11-08T00:00:00Z',
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  useAppStore.setState({
    items: ['a', 'b', 'a1', 'a2', 'b1', 'b2', 's1', 's2', 'm1', 'x1', 'x2', 'x3'].map(item),
    toasts: [],
    layoutPrefs: { [SCOPE]: seededPrefs() },
  });
});

describe('布局偏好写入：成功与失败', () => {
  it('IPC 写入成功：状态与持久化一致，不回滚', async () => {
    bridge.layoutSet.mockResolvedValueOnce(undefined);
    await useAppStore.getState().setWallOrder(SCOPE, ['a', 'b']);
    const pref = useAppStore.getState().layoutPrefs[SCOPE]!;
    expect(pref.sortMode).toBe('custom');
    expect(pref.orderedMediaIds).toEqual(['a', 'b']);
    expect(bridge.layoutSet).toHaveBeenCalledWith(SCOPE, expect.objectContaining({ orderedMediaIds: ['a', 'b'] }));
    expect(useAppStore.getState().toasts).toHaveLength(0);
  });

  it('IPC 写入失败：回滚到保存前状态并提示失败（不显示虚假成功）', async () => {
    bridge.layoutSet.mockRejectedValueOnce(new Error('IPC 已断开'));
    await useAppStore.getState().setWallOrder(SCOPE, ['a', 'b']);
    const pref = useAppStore.getState().layoutPrefs[SCOPE]!;
    expect(pref).toEqual(seededPrefs());
    const toasts = useAppStore.getState().toasts;
    expect(toasts.length).toBeGreaterThan(0);
    expect(toasts.some((t) => t.message.includes('失败') && t.tone === 'error')).toBe(true);
  });

  it('setLayoutSortMode 失败同样回滚排序模式', async () => {
    bridge.layoutSet.mockRejectedValueOnce(new Error('IPC 已断开'));
    await useAppStore.getState().setLayoutSortMode(SCOPE, 'title');
    expect(useAppStore.getState().layoutPrefs[SCOPE]!.sortMode).toBe('rating');
  });
});

describe('写入竞态（任务书 10.3–10.4）', () => {
  function deferred<T>() {
    let resolve!: (v: T) => void;
    let reject!: (e: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  }

  it('快速连续两次拖拽：旧请求失败不得回滚新操作', async () => {
    const first = deferred<void>();
    bridge.layoutSet.mockImplementationOnce(() => first.promise);
    bridge.layoutSet.mockImplementationOnce(async () => undefined);

    const callA = useAppStore.getState().setWallOrder(SCOPE, ['a1', 'a2']); // 慢且将失败
    const callB = useAppStore.getState().setWallOrder(SCOPE, ['b1', 'b2']); // 快且成功
    // 此时状态已乐观变为 B；A 排在队列前面
    first.reject(new Error('第一次写入失败'));
    await callA;
    await callB;

    const pref = useAppStore.getState().layoutPrefs[SCOPE]!;
    // A 的失败绝不能回滚 B 的最新操作
    expect(pref.orderedMediaIds).toEqual(['b1', 'b2']);
    expect(pref.sortMode).toBe('custom');
    expect(useAppStore.getState().toasts.some((t) => t.tone === 'error')).toBe(true);
  });

  it('同一作用域写入串行化：第二次 IPC 等第一次完成', async () => {
    const order: string[] = [];
    const gate = deferred<void>();
    bridge.layoutSet.mockImplementationOnce(async () => {
      order.push('first-start');
      await gate.promise;
      order.push('first-end');
    });
    bridge.layoutSet.mockImplementationOnce(async () => {
      order.push('second-start');
    });

    const callA = useAppStore.getState().setWallOrder(SCOPE, ['s1']);
    const callB = useAppStore.getState().setWallOrder(SCOPE, ['s2']);
    // A 已开始（first-start 已记录），B 仍在队列里等待
    await vi.waitFor(() => expect(order).toEqual(['first-start']));
    gate.resolve(undefined);
    await callA;
    await callB;
    expect(order).toEqual(['first-start', 'first-end', 'second-start']);
  });

  it('不同作用域互不阻塞（没有全局锁）', async () => {
    const gate = deferred<void>();
    bridge.layoutSet.mockImplementationOnce(() => gate.promise);
    bridge.layoutSet.mockImplementationOnce(async () => undefined);

    const slow = useAppStore.getState().setWallOrder('library:movie', ['m1']);
    // 另一个作用域不应该等第一个
    await useAppStore.getState().setWallOrder('library:anime', ['a1']);
    expect(bridge.layoutSet).toHaveBeenCalledTimes(2);
    expect(useAppStore.getState().layoutPrefs['library:anime']!.orderedMediaIds).toEqual(['a1']);
    gate.resolve(undefined);
    await slow;
  });
});
