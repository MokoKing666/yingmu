import { useReducedMotion } from 'motion/react';

/**
 * 全项目唯一的「减少动态效果」开关。
 *
 * 为什么要单独包一层：Motion 的 `useReducedMotion()` 会订阅
 * `prefers-reduced-motion` 的**变化**（不是只读一次），但每个组件自己
 * 判断一次就会出现「有的关了、有的还在动」的不一致。
 * 所有动画入口（页面转场、导航抽屉、遮罩、磁贴入场/悬停/拖拽、
 * 共享元素、Modal、Toast、PixiJS 背景）一律从这里读取同一个值。
 *
 * 用法：
 *   const reduceMotion = useMotionPreference();
 *   <motion.div
 *     initial={reduceMotion ? false : { opacity: 0 }}
 *     transition={reduceMotion ? { duration: 0 } : spring}
 *   />
 *
 * 约定：reduceMotion 为 true 时，**非必要动画必须完全停用**，
 * 而不是只把时长调短；功能本身不能受影响。
 */
export function useMotionPreference(): boolean {
  return useReducedMotion() === true;
}
