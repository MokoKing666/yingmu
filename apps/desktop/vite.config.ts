import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': r('./src'),
      '@yingmu/media-models': r('../../packages/media-models/src/index.ts'),
      '@yingmu/player-api': r('../../packages/player-api/src/index.ts'),
      '@yingmu/design-tokens': r('../../packages/design-tokens/src/index.ts'),
    },
  },
  server: {
    port: 5173,
    strictPort: false,
    host: '127.0.0.1',
  },
  build: {
    target: 'es2022',
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      output: {
        // Vite 8 使用 Rolldown，manualChunks 只接受函数形式（对象映射已移除）。
        // PixiJS 体积较大，独立分包避免拖慢首屏幕墙渲染。
        manualChunks(id) {
          if (id.includes('node_modules/pixi.js')) return 'pixi';
          if (id.includes('node_modules/motion') || id.includes('node_modules/framer-motion')) {
            return 'motion';
          }
          return undefined;
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
    },
  },
});
