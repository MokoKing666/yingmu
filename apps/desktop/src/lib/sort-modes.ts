/**
 * 影幕 — 排序模式的唯一实现。
 *
 * 页面不再自己写 `.sort()`，而是显式声明 SortMode，由这里统一执行，
 * 这样「最近加入 / 年份 / 评分 / 名称 / 推荐 / 自定义」六种排序只有一份实现，
 * 也才能保证「页面指定排序不会被全局 customOrder 静默覆盖」。
 */
import type { MediaId, MediaItem } from '@yingmu/media-models';
import { orderByRecommendation } from './wall-layout';
import { applyCustomOrder } from './layout-preferences';
import type { SortMode } from './layout-preferences';

export type { SortMode } from './layout-preferences';

/**
 * 按排序模式产出最终交给布局引擎的顺序。
 *
 * - `custom` 才会读自定义序号；其余模式**完全忽略** customOrder，
 *   这正是 v0.3.0 的缺陷所在（只要 customOrder 非空就全局覆盖）。
 * - `recommended` 用确定性的推荐权重，而不是「最早入库」。
 * - 年份 / 评分 / 名称 / 最近加入都用稳定次级键（addedAt → id），
 *   保证同一批数据多次排序结果完全一致。
 */
export function applySortMode(
  items: readonly MediaItem[],
  mode: SortMode,
  customOrder?: Record<MediaId, number>,
): MediaItem[] {
  switch (mode) {
    case 'recommended':
      return orderByRecommendation([...items]);
    case 'custom':
      return applyCustomOrder(items, customOrder);
    case 'year':
      return [...items].sort(
        (a, b) =>
          (b.metadata.year ?? 0) - (a.metadata.year ?? 0) ||
          a.addedAt.localeCompare(b.addedAt) ||
          a.id.localeCompare(b.id),
      );
    case 'rating':
      return [...items].sort(
        (a, b) =>
          (b.metadata.rating ?? 0) - (a.metadata.rating ?? 0) ||
          a.addedAt.localeCompare(b.addedAt) ||
          a.id.localeCompare(b.id),
      );
    case 'title':
      return [...items].sort(
        (a, b) => a.metadata.title.localeCompare(b.metadata.title, 'zh-CN') || a.id.localeCompare(b.id),
      );
    case 'recent':
    default:
      return [...items].sort((a, b) => b.addedAt.localeCompare(a.addedAt) || a.id.localeCompare(b.id));
  }
}

/** 排序模式是否由用户自定义排列驱动（拖拽后页面应切到这个模式） */
export function isCustomMode(mode: SortMode): boolean {
  return mode === 'custom';
}
