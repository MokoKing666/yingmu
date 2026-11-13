/**
 * 全新安装默认排序一致性（任务书 6）。
 *
 * 默认规则唯一真源是 `defaultSortFor`：home=recommended，其余=recent。
 * SQLite 迁移默认值、Rust command 默认响应、WebDemoBridge、Zustand 回退、
 * 页面 Segmented 初始选中都必须与它一致。这里在**全新 localStorage**
 * （模拟全新安装）下逐作用域验证 WebDemoBridge 与空偏好生成函数。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { WebDemoBridge } from '@/lib/bridge/web-demo';
import {
  defaultSortFor,
  emptyLayoutPreferences,
  libraryScope,
  SCOPE_FAVORITES,
  SCOPE_HOME,
} from '@/lib/layout-preferences';

const ALL_SCOPES = [
  SCOPE_HOME,
  libraryScope('movie'),
  libraryScope('tv'),
  libraryScope('anime'),
  libraryScope('documentary'),
  libraryScope('personal'),
  SCOPE_FAVORITES,
];

beforeEach(() => {
  localStorage.clear();
});

describe('默认排序规则（唯一真源）', () => {
  it('首页 recommended，其余一律 recent', () => {
    expect(defaultSortFor(SCOPE_HOME)).toBe('recommended');
    for (const scope of ALL_SCOPES.filter((s) => s !== SCOPE_HOME)) {
      expect(defaultSortFor(scope), scope).toBe('recent');
    }
  });

  it('大小写与空白不影响判定（与 normalizeScope 对齐）', () => {
    expect(defaultSortFor(' HOME ')).toBe('recommended');
    expect(defaultSortFor('home')).toBe('recommended');
  });

  it('emptyLayoutPreferences 按作用域给默认排序', () => {
    expect(emptyLayoutPreferences(SCOPE_HOME).sortMode).toBe('recommended');
    expect(emptyLayoutPreferences(libraryScope('movie')).sortMode).toBe('recent');
    expect(emptyLayoutPreferences(SCOPE_FAVORITES).sortMode).toBe('recent');
  });
});

describe('全新安装（空 localStorage）下各页面默认状态一致', () => {
  it('WebDemoBridge 对所有作用域返回与 defaultSortFor 相同的默认值', async () => {
    const bridge = new WebDemoBridge();
    for (const scope of ALL_SCOPES) {
      const pref = await bridge.layoutGet(scope);
      expect(pref.sortMode, scope).toBe(defaultSortFor(scope));
      expect(pref.orderedMediaIds, scope).toEqual([]);
      expect(pref.scope, scope).toBe(scope);
    }
  });

  it('两个新实例对同一空作用域的默认值完全一致（重启不变）', async () => {
    const first = await new WebDemoBridge().layoutGet(libraryScope('anime'));
    const second = await new WebDemoBridge().layoutGet(libraryScope('anime'));
    expect(first).toEqual(second);
    expect(first.sortMode).toBe('recent');
  });

  it('保存过偏好的用户不受默认值影响（升级不覆盖）', async () => {
    const bridge = new WebDemoBridge();
    await bridge.layoutSet(libraryScope('movie'), {
      scope: libraryScope('movie'),
      sortMode: 'rating',
      orderedMediaIds: ['a', 'b'],
      updatedAt: '2026-11-08T00:00:00Z',
    });
    const reloaded = await new WebDemoBridge().layoutGet(libraryScope('movie'));
    expect(reloaded.sortMode).toBe('rating');
    expect(reloaded.orderedMediaIds).toEqual(['a', 'b']);
  });
});
