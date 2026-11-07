import { useEffect, useRef } from 'react';
import type { Application } from 'pixi.js';

/**
 * PixiJS 8 动态光影背景
 * 只在确需高性能 Canvas 动画的模块使用：缓慢漂移的光圈与光束，呼应品牌母题。
 * WebGL 不可用 / 测试环境 / 减少动态效果偏好时静默降级为 CSS 渐变，不抛错。
 */
export function DynamicBackdrop() {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

    let disposed = false;
    let app: Application | undefined;

    void (async () => {
      try {
        const PIXI = await import('pixi.js');
        if (disposed) return;

        const instance = new PIXI.Application();
        await instance.init({
          resizeTo: container,
          backgroundAlpha: 0,
          antialias: true,
          autoDensity: true,
          resolution: Math.min(window.devicePixelRatio || 1, 1.5),
        });
        if (disposed) {
          instance.destroy(true, { children: true });
          return;
        }
        app = instance;
        container.appendChild(instance.canvas);

        const graphics = new PIXI.Graphics();
        instance.stage.addChild(graphics);

        const orbs = [
          { x: 0.22, y: 0.42, r: 190, speed: 0.09, phase: 0, alpha: 0.1 },
          { x: 0.66, y: 0.28, r: 250, speed: 0.06, phase: 1.7, alpha: 0.075 },
          { x: 0.88, y: 0.62, r: 150, speed: 0.12, phase: 3.1, alpha: 0.09 },
        ];

        let elapsed = 0;
        instance.ticker.add((ticker) => {
          elapsed += ticker.deltaMS / 1000;
          const w = instance.renderer.width / instance.renderer.resolution;
          const h = instance.renderer.height / instance.renderer.resolution;
          graphics.clear();
          for (const orb of orbs) {
            const dx = Math.cos(elapsed * orb.speed + orb.phase) * 42;
            const dy = Math.sin(elapsed * orb.speed * 0.8 + orb.phase) * 26;
            graphics
              .circle(orb.x * w + dx, orb.y * h + dy, orb.r)
              .fill({ color: 0xd9a55b, alpha: orb.alpha });
            graphics
              .circle(orb.x * w + dx, orb.y * h + dy, orb.r * 0.62)
              .stroke({ color: 0xf2efe9, alpha: 0.045, width: 1.5 });
          }
        });
      } catch {
        // 无 WebGL（CI / jsdom / 远程桌面）：保留 CSS 静态渐变背景
      }
    })();

    return () => {
      disposed = true;
      try {
        app?.destroy(true, { children: true, texture: true });
      } catch {
        // 销毁失败不阻断页面卸载
      }
    };
  }, []);

  return <div className="wall-backdrop" ref={containerRef} aria-hidden="true" />;
}
