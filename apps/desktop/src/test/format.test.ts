import { describe, it, expect } from 'vitest';
import { formatClock, formatDuration, formatBytes, formatPercent, formatRating, hashString, truncate, KIND_LABEL } from '@/lib/format';

describe('formatClock', () => {
  it('小于一小时输出 MM:SS', () => {
    expect(formatClock(0)).toBe('00:00');
    expect(formatClock(92)).toBe('01:32');
    expect(formatClock(3599)).toBe('59:59');
  });
  it('超过一小时输出 HH:MM:SS', () => {
    expect(formatClock(3600)).toBe('01:00:00');
    expect(formatClock(8042)).toBe('02:14:02');
  });
  it('非法输入安全回退', () => {
    expect(formatClock(-10)).toBe('00:00');
    expect(formatClock(Number.NaN)).toBe('00:00');
  });
});

describe('formatDuration / formatBytes', () => {
  it('时长转中文', () => {
    expect(formatDuration(3600)).toBe('1 小时 0 分');
    expect(formatDuration(7380)).toBe('2 小时 3 分');
    expect(formatDuration(900)).toBe('15 分钟');
    expect(formatDuration(undefined)).toBe('—');
  });
  it('字节单位换算', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(1024 * 1024 * 1024)).toBe('1.0 GB');
  });
});

describe('纯函数工具', () => {
  it('百分比被限制在 0–100', () => {
    expect(formatPercent(30, 120)).toBe(25);
    expect(formatPercent(-5, 100)).toBe(0);
    expect(formatPercent(200, 100)).toBe(100);
    expect(formatPercent(1, 0)).toBe(0);
  });
  it('评分格式化', () => {
    // 使用无二进制舍入歧义的数值断言（8.45 在 IEEE-754 下 toFixed 会得到 8.4）
    expect(formatRating(8.46)).toBe('8.5');
    expect(formatRating(undefined)).toBe('—');
  });
  it('hashString 确定性且对输入敏感', () => {
    expect(hashString('影幕')).toBe(hashString('影幕'));
    expect(hashString('影幕')).not.toBe(hashString('YingMu'));
    expect(hashString('')).toBeGreaterThanOrEqual(0);
  });
  it('截断与类型标签', () => {
    expect(truncate('abcdef', 4)).toBe('abc…');
    expect(truncate('abc', 4)).toBe('abc');
    expect(KIND_LABEL.movie).toBe('电影');
  });
});
