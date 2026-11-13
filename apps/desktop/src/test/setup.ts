import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
});

// jsdom 不实现 ResizeObserver / IntersectionObserver / matchMedia，
// 磁贴幕墙的可见区域渲染与懒加载依赖它们，这里提供可控的测试替身。
class MockResizeObserver implements ResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

class MockIntersectionObserver implements IntersectionObserver {
  readonly root = null;
  readonly rootMargin = '';
  // TS 6 / lib.dom 的 IntersectionObserver 新增 scrollMargin 只读属性
  readonly scrollMargin = '';
  readonly thresholds: ReadonlyArray<number> = [];
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
}

vi.stubGlobal('ResizeObserver', MockResizeObserver);
vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);
vi.stubGlobal(
  'matchMedia',
  vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
);
