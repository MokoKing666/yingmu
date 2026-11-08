/**
 * 影幕 — 布局偏好（排序模式 + 自定义排列）的作用域约定与纯函数。
 *
 * 为什么需要作用域：用户在「动画库」拖拽磁贴时，不应该改变「电影库」或首页的排列。
 * v0.3.0 只有一份全局 `customOrder`，任何页面的拖拽都会覆盖所有页面的排序结果，
 * 这是 v0.3.1 修掉的核心缺陷之一。
 *
 * 类型（`SortMode` / `LayoutPreferences`）的唯一真源在 `@yingmu/media-models`，
 * TS 与 Rust 共用；这里只放作用域约定与不依赖存储的纯函数。
 */
import type { MediaId } from '@yingmu/media-models';
import type { LayoutPreferences, SortMode } from '@yingmu/media-models';

export type { LayoutPreferences, SortMode };

export const SORT_MODE_LABEL: Record<SortMode, string> = {
  recommended: '推荐',
  recent: '最近加入',
  year: '年份',
  rating: '评分',
  title: '名称',
  custom: '自定义排列',
};

export function emptyLayoutPreferences(scope: string): LayoutPreferences {
  return { scope, sortMode: 'recommended', orderedMediaIds: [], updatedAt: new Date(0).toISOString() };
}

/* ------------------------------------------------------------------ */
/* 作用域约定                                                          */
/* ------------------------------------------------------------------ */

export const SCOPE_HOME = 'home';
export const SCOPE_FAVORITES = 'favorites';

/** 媒体库作用域：`library:movie` / `library:tv` / … */
export function libraryScope(kind: string): string {
  return `library:${kind}`;
}

/** 作用域标识统一小写去空白，避免 `Home` 与 `home` 被当成两个视图 */
export function normalizeScope(scope: string): string {
  return scope.trim().toLowerCase();
}

/* ------------------------------------------------------------------ */
/* 自定义排列                                                          */
/* ------------------------------------------------------------------ */

/**
 * 把「有序 ID 列表」转成序号表。只包含列表里出现过的条目，
 * 因此天然支持「部分自定义」：没被摆过的条目不会拿到序号。
 */
export function toOrderMap(orderedIds: readonly MediaId[]): Record<MediaId, number> {
  const map: Record<MediaId, number> = {};
  orderedIds.forEach((id, index) => {
    map[id] = index;
  });
  return map;
}

/**
 * 部分自定义顺序的稳定合并。
 *
 * 规则（对应任务书 5.3）：
 *  1. 有自定义序号的条目按序号升序；
 *  2. 没有序号的条目**保持调用方原始相对顺序**；
 *  3. 序号相同时用**原始 index** 做次级排序（稳定，且不引入 ID 顺序）；
 *  4. 绝不使用 Media ID 排序兜底——那会让「只拖了两个磁贴」变成「其余全部洗牌」。
 */
export function applyCustomOrder<T extends { id: MediaId }>(
  items: readonly T[],
  order: Record<MediaId, number> | undefined,
): T[] {
  if (!order || Object.keys(order).length === 0) return [...items];
  const MISSING = Number.MAX_SAFE_INTEGER;
  return items
    .map((item, index) => ({
      item,
      index,
      rank: Object.prototype.hasOwnProperty.call(order, item.id) ? order[item.id]! : MISSING,
    }))
    .sort((a, b) => (a.rank !== b.rank ? a.rank - b.rank : a.index - b.index))
    .map((entry) => entry.item);
}

/** 把当前顺序压成有序 ID 列表（用于持久化） */
export function snapshotOrder(items: readonly { id: MediaId }[]): MediaId[] {
  return items.map((item) => item.id);
}

/**
 * 筛选子集拖拽后的完整作用域顺序合并（任务书 5.2）。
 *
 * 为什么需要它：LibraryPage 把「按 Genre 筛选后的子集」交给幕墙，幕墙只能看到
 * 子集。如果拖拽后直接用子集覆盖持久化顺序，子集之外的媒体（例如 100 部电影里
 * 未被筛出的 85 部）的自定义位置会被整体丢弃。
 *
 * 算法：
 *  1. `fullOrder` 是拖拽前完整作用域的顺序（包含全部有效媒体，含未入镜的新媒体）；
 *  2. 从完整顺序里抽走本次可见子集的成员，剩余成员保持原有相对顺序；
 *  3. 以「可见子集在完整顺序中的第一个位置」为锚点，把拖拽后的子集整体插回锚点处；
 *  4. 去重兜底（防御调用方传入重叠集合）。
 *
 * 不变量：
 *  - 结果包含 fullOrder 的全部成员（不丢弃未显示的媒体）；
 *  - 子集外成员的相对顺序与拖拽前完全一致；
 *  - 子集内部的相对顺序 = `visibleAfter`；
 *  - fullOrder 里不存在、也不在 visibleAfter 里的 ID 不会凭空出现。
 */
export function mergeVisibleOrder(
  fullOrder: readonly MediaId[],
  visibleBefore: readonly MediaId[],
  visibleAfter: readonly MediaId[],
): MediaId[] {
  const visibleSet = new Set<MediaId>(visibleBefore);
  const rest = fullOrder.filter((id) => !visibleSet.has(id));
  const anchor = fullOrder.findIndex((id) => visibleSet.has(id));
  // 锚点换成 rest 坐标系：可见集之前有多少个「非可见」成员
  const beforeCount =
    anchor < 0
      ? rest.length
      : fullOrder.slice(0, anchor).filter((id) => !visibleSet.has(id)).length;

  const merged = [...rest.slice(0, beforeCount), ...visibleAfter, ...rest.slice(beforeCount)];
  const seen = new Set<MediaId>();
  return merged.filter((id) => {
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}
