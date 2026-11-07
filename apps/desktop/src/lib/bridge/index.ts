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

export { WebDemoBridge, TauriBridge };
