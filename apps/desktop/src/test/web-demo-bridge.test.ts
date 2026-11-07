import { describe, it, expect, beforeEach } from 'vitest';
import { WebDemoBridge } from '@/lib/bridge/web-demo';
import { buildDemoLibrary } from '@/lib/demo-data';

let bridge: WebDemoBridge;

beforeEach(() => {
  localStorage.clear();
  bridge = new WebDemoBridge();
});

describe('WebDemoBridge 媒体库', () => {
  it('提供完整演示条目且字段结构完整', async () => {
    const items = await bridge.libraryList();
    expect(items.length).toBeGreaterThanOrEqual(20);
    for (const item of items) {
      expect(item.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(item.versions.length).toBeGreaterThanOrEqual(1);
      expect(item.metadata.title.length).toBeGreaterThan(0);
      expect(item.versions[0]!.audio.length).toBeGreaterThan(0);
    }
  });

  it('按媒体类型过滤', async () => {
    const movies = await bridge.libraryList('movie');
    expect(movies.length).toBeGreaterThan(0);
    expect(movies.every((m) => m.kind === 'movie')).toBe(true);
  });

  it('收藏状态可持久化（换实例后仍在）', async () => {
    const [first] = await bridge.libraryList();
    const original = first!.favorite;
    await bridge.librarySetFavorite(first!.id, !original);
    const reloaded = await new WebDemoBridge().libraryGet(first!.id);
    expect(reloaded!.favorite).toBe(!original);
  });

  it('手动元数据修正不会破坏原始文件信息', async () => {
    const [first] = await bridge.libraryList();
    const before = first!;
    const updated = await bridge.libraryUpdateMetadata(before.id, { title: '手动修正的片名' });
    expect(updated.metadata.title).toBe('手动修正的片名');
    expect(updated.id).toBe(before.id);
    expect(updated.versions).toEqual(before.versions);
    expect(updated.metadata.origin).toBe('manual');
  });
});

describe('WebDemoBridge 搜索', () => {
  it('按片名命中并支持分页', async () => {
    const all = await bridge.libraryList();
    const title = all[0]!.metadata.title;
    const result = await bridge.search({ text: title, limit: 1 });
    expect(result.total).toBeGreaterThanOrEqual(1);
    expect(result.items).toHaveLength(1);
    expect(result.snippets?.[result.items[0]!.id]).toBeTruthy();
  });

  it('按类型与收藏组合过滤', async () => {
    const result = await bridge.search({ text: '', kinds: ['anime'], favoritesOnly: true });
    expect(result.items.every((i) => i.kind === 'anime' && i.favorite)).toBe(true);
  });

  it('无匹配时返回空结果而不是报错', async () => {
    const result = await bridge.search({ text: '绝不可能存在的片名XYZ' });
    expect(result.total).toBe(0);
    expect(result.items).toEqual([]);
  });
});

describe('WebDemoBridge 诚实性约束', () => {
  it('诊断报告不谎称播放器后端可用', async () => {
    const report = await bridge.diagnosticsReport();
    expect(report.backend).toBe('none');
    expect(report.backendReady).toBe(false);
    expect(report.notes.join(' ')).toContain('未集成');
  });

  it('演示模式不发起真实网络连接', async () => {
    const result = await bridge.sourceTest('src-nas-demo');
    expect(result.ok).toBe(false);
    expect(result.message).toContain('演示模式');
  });

  it('扫描状态不伪造发现数量', async () => {
    const status = await bridge.scanStatus('src-local-demo');
    expect(status.state).toBe('idle');
    expect(status.duplicates).toBe(0);
  });

  it('设置项可持久化', async () => {
    await bridge.settingsSet({ theme: 'light', subtitleFontSize: 30 });
    const settings = await new WebDemoBridge().settingsGet();
    expect(settings.theme).toBe('light');
    expect(settings.subtitleFontSize).toBe(30);
  });

  it('演示数据与真实媒体库条目互不混淆', () => {
    const items = buildDemoLibrary();
    expect(new Set(items.map((i) => i.id)).size).toBe(items.length);
    expect(items.every((i) => i.metadata.origin === 'manual')).toBe(true);
  });
});
