/**
 * 全局「减少动态效果」一致性测试（任务书 7）。
 *
 * 两个层面：
 * 1. **静态约束**：任何使用 motion.* 的组件都必须从 useMotionPreference() 读取开关，
 *    不允许某个组件绕过全局设置自己决定是否播放动画；
 * 2. **行为**：系统偏好变化时开关跟着变（Motion 的 useReducedMotion 订阅 media query）。
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const SRC = join(process.cwd(), 'src');

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.(tsx|ts)$/.test(name)) out.push(full);
  }
  return out;
}

describe('动效开关的统一性', () => {
  it('所有使用 motion 的组件都必须读取 useMotionPreference', () => {
    const offenders: string[] = [];
    for (const file of walk(SRC)) {
      const code = readFileSync(file, 'utf8');
      if (!/from 'motion\/react'/.test(code)) continue;
      if (file.endsWith(join('hooks', 'use-motion-preference.ts'))) continue;
      if (file.includes(join('test', ''))) continue;
      const usesHook = /useMotionPreference\s*\(/.test(code);
      if (!usesHook) offenders.push(relative(SRC, file));
    }
    expect(offenders, `这些文件用了 motion 但没有接全局开关：${offenders.join(', ')}`).toEqual([]);
  });

  it('DynamicBackdrop 在减少动态效果时不启动 PixiJS（降级为静态 CSS 背景）', () => {
    const code = readFileSync(join(SRC, 'components', 'wall', 'DynamicBackdrop.tsx'), 'utf8');
    // 效果必须依赖 reduceMotion，而不是空依赖数组「只在初始化判断一次」
    expect(code).toMatch(/\[reduceMotion\]/);
    expect(code).toMatch(/if \(reduceMotion\) return;/);
  });
});

describe('useMotionPreference 行为', () => {
  it('把 Motion 的 useReducedMotion 结果原样透出（不缓存、不自己读 matchMedia）', () => {
    const source = readFileSync(join(SRC, 'hooks', 'use-motion-preference.ts'), 'utf8');
    // 必须复用 Motion 的响应式 hook（它订阅 media query 变化），
    // 而不是自己 matchMedia 一次然后存成常量
    expect(source).toMatch(/useReducedMotion/);
    expect(source).not.toMatch(/matchMedia/);
    expect(source).not.toMatch(/useRef|useMemo|useState/);
  });

  it('开关值为 true / false 两种取值都能正确透传', async () => {
    // 通过模块 mock 验证透传行为；「偏好变化时更新」由 Motion 的
    // useReducedMotion 保证（它内部订阅 matchMedia 的 change 事件）。
    let flag = true;
    vi.doMock('motion/react', () => ({
      useReducedMotion: () => flag,
    }));
    const { useMotionPreference: freshHook } = await import('@/hooks/use-motion-preference');
    const { renderHook: freshRender } = await import('@testing-library/react');

    const first = freshRender(() => freshHook());
    expect(first.result.current).toBe(true);

    flag = false;
    first.rerender();
    expect(first.result.current).toBe(false);

    vi.doUnmock('motion/react');
    vi.resetModules();
  });
});
