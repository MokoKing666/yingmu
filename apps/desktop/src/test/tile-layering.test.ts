/**
 * 磁贴层级契约测试（任务书 4.1）。
 *
 * 真实命中测试由 scripts/browser-tile-clicks.mjs 用 Edge 验证；
 * 这里做静态契约检查：z-index 阶梯与 pointer-events 必须保持
 * 「装饰层 0 < 主体 Link 1 < 信息层 2 < 按钮 3」，
 * 防止未来有人改 CSS 时把图片又压回链接上面。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const wallCss = readFileSync(join(process.cwd(), 'src', 'styles', 'wall.css'), 'utf8');

/** 取某选择器的规则体；(^|\n) 锚定行首，避免命中 `.compact .tile-actions,` 这类分组选择器 */
function ruleBlock(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(^|\\n)${escaped}\\s*\\{([^}]*)\\}`);
  const m = re.exec(wallCss);
  if (!m || m[2] === undefined) throw new Error(`wall.css 中找不到 ${selector} 的规则体`);
  return m[2];
}

function zIndexOf(block: string): number {
  const m = /z-index:\s*(\d+)/.exec(block);
  if (!m?.[1]) throw new Error('规则块中没有 z-index');
  return Number(m[1]);
}

describe('磁贴内部层级契约', () => {
  it('主体 Link 的 z-index 高于封面图片', () => {
    const link = zIndexOf(ruleBlock('.tile-link'));
    const art = zIndexOf(ruleBlock('.tile-art'));
    expect(link).toBeGreaterThan(art);
  });

  it('封面图与骨架屏不拦截点击（pointer-events: none）', () => {
    expect(ruleBlock('.tile-art')).toMatch(/pointer-events:\s*none/);
    expect(ruleBlock('.tile-art-placeholder')).toMatch(/pointer-events:\s*none/);
  });

  it('徽标信息层穿透点击、且低于按钮层', () => {
    expect(ruleBlock('.tile-badges')).toMatch(/pointer-events:\s*none/);
    expect(zIndexOf(ruleBlock('.tile-actions'))).toBeGreaterThan(zIndexOf(ruleBlock('.tile-badges')));
  });

  it('标题信息层不拦截点击（点击标题 = 点击主体 Link）', () => {
    expect(ruleBlock('.tile-content')).toMatch(/pointer-events:\s*none/);
  });

  it('遮罩是纯装饰层（pointer-events: none）', () => {
    expect(ruleBlock('.tile-scrim')).toMatch(/pointer-events:\s*none/);
  });
});
