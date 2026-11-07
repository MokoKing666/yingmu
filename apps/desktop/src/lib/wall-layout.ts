/**
 * 不规则磁贴幕墙布局算法（纯函数，可单元测试）
 *
 * 不同于等宽卡片网格：以 12 列 dense grid 为基础，按内容重要性分配
 * hero / portrait-lg / portrait-sm / wide / resume / dynamic 六种尺寸层次。
 * CSS Grid 的 dense 流负责实际空洞填充；本模块只负责尺寸与顺序决策，
 * 不接触 DOM，因此可在 CI 中独立测试。
 */

import { tile as tileTokens } from '@yingmu/design-tokens';
import type { MediaId, MediaItem, TileLayout } from '@yingmu/media-models';

export type WallVariant = TileLayout['variant'];

/** 一个视觉节奏周期：大主视觉 → 竖版 → 宽幅 → 小卡 → 续播 → 动态 */
export const WALL_PATTERN: WallVariant[] = [
  'portrait-lg',
  'portrait-sm',
  'wide',
  'portrait-sm',
  'resume',
  'portrait-lg',
  'dynamic',
  'portrait-sm',
];

export interface WallLayoutOptions {
  /** 用户拖拽排序后的自定义顺序：mediaId → 目标序号 */
  customOrder?: Record<MediaId, number>;
  /** 是否启用大主视觉（窄屏或子页面可关闭） */
  heroEnabled?: boolean;
}

/** 单条目的变体决策：续播与收藏优先获得更强的视觉权重 */
export function variantForItem(
  item: MediaItem,
  index: number,
  opts: { usedResumes: number; heroEnabled: boolean },
): WallVariant {
  if (opts.heroEnabled && index === 0) return 'hero';

  if (item.resumeSeconds != null && item.resumeSeconds > 0 && opts.usedResumes < 2) {
    return 'resume';
  }
  if (item.favorite && index % 3 === 0) return 'wide';

  const offset = opts.heroEnabled ? index - 1 : index;
  return WALL_PATTERN[((offset % WALL_PATTERN.length) + WALL_PATTERN.length) % WALL_PATTERN.length]!;
}

/**
 * 计算完整幕墙布局。
 * - 输出按 order 升序，order 唯一且连续；
 * - 所有 colSpan ≤ 12（超出会被 CSS 截断，这里提前保护）；
 * - 相同输入结果稳定，便于共享元素转场与拖拽排序持久化。
 */
export function computeWallLayout(items: MediaItem[], options: WallLayoutOptions = {}): TileLayout[] {
  if (items.length === 0) return [];

  const heroEnabled = options.heroEnabled ?? true;
  const ordered = [...items].sort((a, b) => {
    const oa = options.customOrder?.[a.id] ?? Number.MAX_SAFE_INTEGER;
    const ob = options.customOrder?.[b.id] ?? Number.MAX_SAFE_INTEGER;
    if (oa !== ob) return oa - ob;
    return a.addedAt.localeCompare(b.addedAt) || a.id.localeCompare(b.id);
  });

  let usedResumes = 0;
  const layouts: TileLayout[] = [];

  ordered.forEach((item, index) => {
    const variant = variantForItem(item, index, { usedResumes, heroEnabled });
    if (variant === 'resume') usedResumes += 1;

    const size = tileTokens.variants[variant];
    layouts.push({
      mediaId: item.id,
      colSpan: Math.min(tileTokens.gridColumns, Math.max(1, size.colSpan)),
      rowSpan: Math.max(1, size.rowSpan),
      variant,
      order: index,
    });
  });

  return layouts;
}

/** 布局自检：供测试与开发期断言使用 */
export function validateLayout(layouts: TileLayout[]): string[] {
  const problems: string[] = [];
  const orders = new Set<number>();
  const ids = new Set<string>();

  for (const l of layouts) {
    if (l.colSpan < 1 || l.colSpan > 12) problems.push(`${l.mediaId}: colSpan ${l.colSpan} 越界`);
    if (l.rowSpan < 1) problems.push(`${l.mediaId}: rowSpan 非正`);
    if (orders.has(l.order)) problems.push(`${l.mediaId}: order ${l.order} 重复`);
    if (ids.has(l.mediaId)) problems.push(`${l.mediaId}: 重复条目`);
    orders.add(l.order);
    ids.add(l.mediaId);
  }
  return problems;
}

/** 把拖拽结果转换成可持久化的 customOrder */
export function toCustomOrder(orderedIds: MediaId[]): Record<MediaId, number> {
  return Object.fromEntries(orderedIds.map((id, index) => [id, index]));
}
