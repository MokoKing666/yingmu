import { describe, it, expect } from 'vitest';
import {
  stableMediaId,
  contentFingerprint,
  demoFingerprint,
  normalizeRelativePath,
  remapRelativePath,
  MEDIA_ID_NAMESPACE,
} from '@/lib/media-id';

describe('stableMediaId', () => {
  it('相同内容指纹永远得到相同 ID', () => {
    const fp = contentFingerprint({ partialHash: 'abcd1234', sizeBytes: 8900000000, modifiedAtMs: 1750000000000 });
    expect(stableMediaId(fp)).toBe(stableMediaId(fp));
  });
  it('输出 UUID 形状并带版本/变体位', () => {
    const id = stableMediaId('fingerprint-a');
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/);
  });
  it('不同指纹产生不同 ID', () => {
    expect(stableMediaId('a')).not.toBe(stableMediaId('b'));
  });
  it('命名空间固定，保证跨设备一致', () => {
    expect(MEDIA_ID_NAMESPACE).toBe('com.moko.yingmu.media.v1');
  });
});

describe('文件路径不参与 Media ID（NAS 换址后保留元数据）', () => {
  it('相同内容、不同路径 → 同一 Media ID', () => {
    const fp = contentFingerprint({ partialHash: 'same-content', sizeBytes: 12345, modifiedAtMs: 1700000000000 });
    const idA = stableMediaId(fp);
    const oldPath = normalizeRelativePath('D:\\Movies\\雾港来信\\雾港来信.mkv');
    const newPath = normalizeRelativePath('\\\\NAS-2026\\Media\\Movies\\雾港来信\\雾港来信.mkv');
    expect(oldPath).not.toBe(newPath);
    // ID 只由内容指纹派生，路径不进入计算
    expect(stableMediaId(fp)).toBe(idA);
  });
  it('重映射不改变相对路径与 ID', () => {
    const fp = demoFingerprint('m01');
    const before = stableMediaId(fp);
    const relative = remapRelativePath('movie/2024/雾港来信/雾港来信.mkv', 'D:\\Movies', '\\\\NAS\\Media');
    expect(relative).toBe('movie/2024/雾港来信/雾港来信.mkv');
    expect(stableMediaId(fp)).toBe(before);
  });
});

describe('contentFingerprint / normalizeRelativePath', () => {
  it('指纹包含大小与秒级修改时间', () => {
    const a = contentFingerprint({ partialHash: 'x', sizeBytes: 100, modifiedAtMs: 1700000000000 });
    const b = contentFingerprint({ partialHash: 'x', sizeBytes: 101, modifiedAtMs: 1700000000000 });
    const c = contentFingerprint({ partialHash: 'x', sizeBytes: 100, modifiedAtMs: 1700000000999 });
    expect(a).not.toBe(b);
    expect(a).toBe(c); // 同一秒内视为同一版本
  });
  it('统一 Windows / POSIX 分隔符', () => {
    expect(normalizeRelativePath('a\\b\\\\c/file.mkv')).toBe('a/b/c/file.mkv');
    expect(normalizeRelativePath('/leading/path')).toBe('leading/path');
  });
});
