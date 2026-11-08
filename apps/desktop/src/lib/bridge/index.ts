import type { PlatformBridge } from '@yingmu/media-models';
import { WebDemoBridge } from './web-demo';
import { TauriBridge } from './tauri';

declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown;
  }
}

/** 是否运行在 Tauri 2 桌面窗口中 */
export function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && Boolean(window.__TAURI_INTERNALS__);
}

let bridge: PlatformBridge | undefined;

/** 全局唯一平台桥接实例。所有 React 组件只能通过它访问数据层。 */
export function getBridge(): PlatformBridge {
  if (!bridge) {
    bridge = isTauriRuntime() ? new TauriBridge() : new WebDemoBridge();
  }
  return bridge;
}

/** 仅演示桥接提供拖拽排序持久化；Tauri 侧由数据库保存布局 */
export function getCustomOrder(): Record<string, number> {
  const b = getBridge();
  return b instanceof WebDemoBridge ? b.getCustomOrder() : {};
}

export function setCustomOrder(order: Record<string, number>): void {
  const b = getBridge();
  if (b instanceof WebDemoBridge) b.setCustomOrder(order);
}

/** 用户为单条媒体调整的图片焦点（0..100），演示桥接用 localStorage 持久化 */
const FOCAL_KEY = 'yingmu.artworkFocal.v1';
export type FocalPoint = { x: number; y: number };

export function getFocalOverrides(): Record<string, FocalPoint> {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(FOCAL_KEY) : null;
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, FocalPoint>) : {};
  } catch {
    return {}; // 存储不可用或数据损坏时退回默认焦点
  }
}

export function setFocalOverrides(value: Record<string, FocalPoint>): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(FOCAL_KEY, JSON.stringify(value));
  } catch {
    // 隐私模式下 localStorage 写入会抛错，焦点调整降级为本次会话有效
  }
}

export { WebDemoBridge, TauriBridge };
