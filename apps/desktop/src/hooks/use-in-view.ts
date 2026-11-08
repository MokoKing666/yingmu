import { useEffect, useRef, useState } from 'react';

/**
 * 可见区域渲染：只在元素接近视口时才加载封面。
 * rootMargin 预加载一圈，滚动时不会看到空白。
 *
 * 当运行环境没有 IntersectionObserver（例如精简测试环境）时，初始值直接为 true，
 * 而不是在 effect 里同步 setState —— 后者会触发级联渲染。
 */
export function useInView<T extends Element>(rootMargin = '320px') {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(() => typeof IntersectionObserver === 'undefined');

  useEffect(() => {
    const element = ref.current;
    if (!element || inView) return;

    if (typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setInView(true);
          observer.disconnect();
        }
      },
      { rootMargin },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [inView, rootMargin]);

  return { ref, inView };
}
