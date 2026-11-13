/**
 * 布局偏好持久化的回归测试（任务书 6.x）。
 *
 * 覆盖 WebDemoBridge 的真实存储路径（localStorage）：
 * - 按作用域持久化、互不污染；
 * - 旧版全局 customOrder 迁移到 home 作用域；
 * - 损坏数据安全回退；
 * - 重启（新建实例）后顺序恢复。
 *
 * TauriBridge 的 SQLite 路径由 Rust 侧 `yingmu-core` 的单元测试覆盖
 * （`layout_get` / `layout_set` / `prune_layout_ids`），
 * 不在本文件里假装已验证桌面端。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { WebDemoBridge } from '@/lib/bridge/web-demo';
import { emptyLayoutPreferences, libraryScope, SCOPE_HOME } from '@/lib/layout-preferences';

beforeEach(() => {
  localStorage.clear();
});

describe('布局偏好持久化（WebDemoBridge / localStorage）', () => {
  it('保存首页自定义顺序后，新建实例仍能恢复', async () => {
    const bridge = new WebDemoBridge();
    await bridge.layoutSet(SCOPE_HOME, {
      scope: SCOPE_HOME,
      sortMode: 'custom',
      orderedMediaIds: ['c', 'a', 'b'],
      updatedAt: '2026-11-08T00:00:00Z',
    });

    const reloaded = await new WebDemoBridge().layoutGet(SCOPE_HOME);
    expect(reloaded.sortMode).toBe('custom');
    expect(reloaded.orderedMediaIds).toEqual(['c', 'a', 'b']);
  });

  it('不同媒体库作用域相互独立（动画库不污染电影库）', async () => {
    const bridge = new WebDemoBridge();
    await bridge.layoutSet(libraryScope('anime'), {
      scope: libraryScope('anime'),
      sortMode: 'custom',
      orderedMediaIds: ['x1', 'x2'],
      updatedAt: '2026-11-08T00:00:00Z',
    });

    const movie = await bridge.layoutGet(libraryScope('movie'));
    expect(movie.orderedMediaIds).toEqual([]);
    // 媒体库作用域的正式默认值是 recent（defaultSortFor）
    expect(movie.sortMode).toBe('recent');

    // 动画库自身仍然保留
    const anime = await bridge.layoutGet(libraryScope('anime'));
    expect(anime.orderedMediaIds).toEqual(['x1', 'x2']);
  });

  it('不存在的作用域返回默认偏好而不是抛错（媒体库默认 recent）', async () => {
    const bridge = new WebDemoBridge();
    const pref = await bridge.layoutGet('library:不存在');
    expect(pref.sortMode).toBe('recent');
    expect(pref.orderedMediaIds).toEqual([]);
    expect(pref.scope).toBe('library:不存在');
    expect(pref).toEqual(emptyLayoutPreferences('library:不存在'));
  });

  it('旧版全局 customOrder 会迁移到 home 作用域（升级不丢数据）', async () => {
    // 模拟 v0.3.0 只写过全局 customOrder 的用户
    localStorage.setItem(
      'yingmu:web-demo:v1',
      JSON.stringify({ customOrder: { b: 0, a: 1, c: 2 } }),
    );
    const bridge = new WebDemoBridge();
    const home = await bridge.layoutGet(SCOPE_HOME);
    expect(home.sortMode).toBe('custom');
    expect(home.orderedMediaIds).toEqual(['b', 'a', 'c']);
    // 迁移后写回 v2，新建实例不再依赖 v1
    const again = await new WebDemoBridge().layoutGet(SCOPE_HOME);
    expect(again.orderedMediaIds).toEqual(['b', 'a', 'c']);
  });

  it('损坏的布局数据安全回退到默认值', async () => {
    localStorage.setItem('yingmu:layout-prefs:v2', '{ 不是合法 JSON');
    const bridge = new WebDemoBridge();
    const pref = await bridge.layoutGet(SCOPE_HOME);
    expect(pref.sortMode).toBe('recommended');
    expect(pref.orderedMediaIds).toEqual([]);
  });

  it('字段类型不对的脏数据被过滤掉，不产生非法条目', async () => {
    localStorage.setItem(
      'yingmu:layout-prefs:v2',
      JSON.stringify({ home: { sortMode: 123, orderedMediaIds: ['ok', 42, null, 'fine'], updatedAt: 1 } }),
    );
    const bridge = new WebDemoBridge();
    const pref = await bridge.layoutGet(SCOPE_HOME);
    expect(pref.orderedMediaIds).toEqual(['ok', 'fine']);
  });

  it('保存失败（隐私模式下 localStorage 拒写）不抛出，本次会话仍可用', async () => {
    const bridge = new WebDemoBridge();
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      throw new Error('QuotaExceededError');
    };
    try {
      await expect(
        bridge.layoutSet(SCOPE_HOME, {
          scope: SCOPE_HOME,
          sortMode: 'custom',
          orderedMediaIds: ['q1'],
          updatedAt: '2026-11-08T00:00:00Z',
        }),
      ).resolves.toBeUndefined();
      const inMemory = await bridge.layoutGet(SCOPE_HOME);
      expect(inMemory.orderedMediaIds).toEqual(['q1']);
    } finally {
      Storage.prototype.setItem = original;
    }
  });
});
