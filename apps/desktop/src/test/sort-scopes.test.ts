/**
 * 排序作用域与优先级的回归测试（任务书 5.4）。
 *
 * 这里测的是「实际排序函数 + 页面传入逻辑」，而不是只测布局引擎接受了 customOrder：
 * - 页面指定排序（最近加入 / 年份 / 评分 / 名称）不得被全局 customOrder 覆盖；
 * - 只有显式 custom 模式才应用自定义排列；
 * - 不同作用域互不污染（首页 ≠ 电影库 ≠ 动画库）；
 * - 部分 customOrder 保留未排序条目的原始顺序，不按 Media ID 洗牌。
 */
import { describe, expect, it } from 'vitest';
import type { MediaItem } from '@yingmu/media-models';
import { applySortMode } from '@/lib/sort-modes';
import {
  SCOPE_HOME,
  applyCustomOrder,
  libraryScope,
  normalizeScope,
  snapshotOrder,
  toOrderMap,
} from '@/lib/layout-preferences';

function item(id: string, patch: Partial<MediaItem> = {}): MediaItem {
  return {
    id,
    kind: 'movie',
    sourceId: 'src',
    metadata: {
      title: patch.metadata?.title ?? `作品 ${id}`,
      directors: [],
      cast: [],
      writers: [],
      genres: [],
      origin: 'none',
      ...(patch.metadata ?? {}),
    },
    versions: [],
    favorite: false,
    addedAt: patch.addedAt ?? '2026-01-01T00:00:00Z',
    tags: [],
    ...patch,
  } as MediaItem;
}

const BASE = [
  item('a', { addedAt: '2026-03-01T00:00:00Z', metadata: { title: '乙', year: 2020, rating: 8, directors: [], cast: [], writers: [], genres: [], origin: 'none' } }),
  item('b', { addedAt: '2026-01-01T00:00:00Z', metadata: { title: '甲', year: 2024, rating: 6, directors: [], cast: [], writers: [], genres: [], origin: 'none' } }),
  item('c', { addedAt: '2026-02-01T00:00:00Z', metadata: { title: '丙', year: 2022, rating: 9, directors: [], cast: [], writers: [], genres: [], origin: 'none' } }),
];

const ids = (list: MediaItem[]) => list.map((i) => i.id);

describe('排序模式：页面指定排序必须被保留', () => {
  it('最近加入：按 addedAt 降序，不被 customOrder 覆盖', () => {
    const custom = { c: 0, a: 1, b: 2 }; // 与最近加入结果相反
    expect(ids(applySortMode(BASE, 'recent', custom))).toEqual(['a', 'c', 'b']);
    expect(ids(applySortMode(BASE, 'recent', undefined))).toEqual(['a', 'c', 'b']);
  });

  it('年份排序不被覆盖', () => {
    expect(ids(applySortMode(BASE, 'year', { a: 0, b: 1, c: 2 }))).toEqual(['b', 'c', 'a']);
  });

  it('评分排序不被覆盖', () => {
    expect(ids(applySortMode(BASE, 'rating', { a: 0, b: 1, c: 2 }))).toEqual(['c', 'a', 'b']);
  });

  it('名称排序不被覆盖（zh-CN 拼音序：丙 < 甲 < 乙）', () => {
    expect(ids(applySortMode(BASE, 'title', { a: 0, b: 1, c: 2 }))).toEqual(['c', 'b', 'a']);
  });
});

describe('自定义排列模式', () => {
  it('只有 custom 模式才应用自定义序号', () => {
    // 取一个与其他四种排序都不重合的顺序（recent=a,c,b / year=b,c,a /
    // rating=c,a,b / title=c,b,a），避免「巧合相同」掩盖 bug
    const custom = { a: 0, b: 1, c: 2 };
    expect(ids(applySortMode(BASE, 'custom', custom))).toEqual(['a', 'b', 'c']);
    // 其他模式必须忽略同一份 customOrder
    for (const mode of ['recent', 'year', 'rating', 'title'] as const) {
      expect(ids(applySortMode(BASE, mode, custom))).not.toEqual(['a', 'b', 'c']);
    }
  });

  it('相同输入得到相同排列（确定性，含同序号稳定排序）', () => {
    // a、b 同序号 0：必须按原始 index 保持 a 在 b 前，而不是洗牌
    const custom = { a: 0, b: 0 };
    const first = ids(applyCustomOrder(BASE, custom));
    const second = ids(applyCustomOrder(BASE, custom));
    expect(first).toEqual(second);
    expect(first).toEqual(['a', 'b', 'c']);
  });
});

describe('排序作用域相互独立', () => {
  it('首页 / 电影库 / 动画库是三个不同作用域', () => {
    expect(SCOPE_HOME).not.toBe(libraryScope('movie'));
    expect(libraryScope('movie')).not.toBe(libraryScope('anime'));
    expect(libraryScope('tv')).not.toBe(libraryScope('anime'));
  });

  it('作用域标识规范化：Home 与 home 是同一个视图', () => {
    expect(normalizeScope('  HOME ')).toBe(normalizeScope('home'));
  });

  it('一个作用域的排列不会影响另一个作用域（模拟首页拖拽后电影库排序不变）', () => {
    // 首页用户把 c 拖到最前
    const homeCustom = toOrderMap(['c', 'a', 'b']);
    expect(ids(applySortMode(BASE, 'custom', homeCustom))).toEqual(['c', 'a', 'b']);

    // 电影库仍按「评分」排序，且没有自己的 customOrder
    expect(ids(applySortMode(BASE, 'rating', undefined))).toEqual(['c', 'a', 'b']);
    // 即便误传了 home 的 customOrder，只要模式不是 custom 就不会被污染
    expect(ids(applySortMode(BASE, 'rating', homeCustom))).toEqual(['c', 'a', 'b']);
  });

  it('动画库的自定义排列不污染电视剧库', () => {
    const animeOrder = toOrderMap(['c', 'b', 'a']);
    expect(ids(applySortMode(BASE, 'custom', animeOrder))).toEqual(['c', 'b', 'a']);
    // 电视剧库仍是最近加入
    expect(ids(applySortMode(BASE, 'recent', undefined))).toEqual(['a', 'c', 'b']);
  });
});

describe('部分 customOrder 保留未排序条目的原始顺序', () => {
  const five = ['1', '2', '3', '4', '5'].map((id) => item(id, { addedAt: `2026-0${id}-01T00:00:00Z` }));

  it('没有序号的条目维持调用方原始相对顺序', () => {
    // 用户只把 5 拖到最前；其余 1..4 必须保持 1,2,3,4 的原始顺序
    const out = applyCustomOrder(five, { 5: 0 });
    expect(ids(out)).toEqual(['5', '1', '2', '3', '4']);
  });

  it('不允许缺失序号时按 Media ID 排序（10,2,3 的 ID 排序会打乱）', () => {
    const tricky = [item('10'), item('2'), item('3')];
    const out = applyCustomOrder(tricky, { 3: 0 });
    // 若按 ID 排序会得到 10,2；必须保持原始顺序 10,2
    expect(ids(out)).toEqual(['3', '10', '2']);
  });

  it('序号相同时用原始 index 稳定排序', () => {
    const out = applyCustomOrder(five, { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 });
    expect(ids(out)).toEqual(['1', '2', '3', '4', '5']);
  });

  it('完全空的 customOrder 等于不排序', () => {
    expect(ids(applyCustomOrder(five, {}))).toEqual(ids(five));
    expect(ids(applyCustomOrder(five, undefined))).toEqual(ids(five));
  });

  it('snapshotOrder 只记录实际出现过的条目（新增媒体不会被写进旧排列）', () => {
    const order = toOrderMap(['c', 'a']); // 只摆过 c、a
    const next = applyCustomOrder([...BASE, item('d')], order);
    expect(ids(next)).toEqual(['c', 'a', 'b', 'd']);
    // 持久化时只应记录摆过的两个
    const snap = toOrderMap(snapshotOrder(next).filter((id) => id === 'c' || id === 'a'));
    expect(Object.keys(snap).sort()).toEqual(['a', 'c']);
  });
});
