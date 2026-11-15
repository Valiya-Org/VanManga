import { describe, it, expect } from 'vitest';
import { effectScope } from 'vue';
import { formatRelativeTime, useRelativeTime } from './useRelativeTime';

// Local-time fixed "now": 2026-11-14 15:00:00.
const NOW = new Date(2026, 10, 14, 15, 0, 0).getTime();
const sec = (d: Date) => d.getTime() / 1000;
const ago = (ms: number) => (NOW - ms) / 1000;

describe('formatRelativeTime', () => {
  it.each([
    [ago(10_000), '刚刚'],
    [ago(-60_000), '刚刚'], // clock skew: future reads as now
    [ago(5 * 60_000), '5 分钟前'],
    [ago(2 * 3_600_000), '2 小时前'],
    [ago(23 * 3_600_000), '23 小时前'],
    [sec(new Date(2026, 10, 13, 8, 0)), '昨天'],
    [sec(new Date(2026, 10, 11, 20, 0)), '3 天前'],
    [sec(new Date(2026, 10, 8, 12, 0)), '6 天前'],
    [sec(new Date(2026, 10, 6, 12, 0)), '上周'],
    [sec(new Date(2026, 10, 1, 12, 0)), '上周'],
    [sec(new Date(2026, 9, 31, 12, 0)), '2026-10-31'],
    [sec(new Date(2026, 9, 30, 12, 0)), '2026-10-30'],
    [sec(new Date(2025, 0, 5, 1, 0)), '2025-01-05'],
  ])('%s → %s', (at, text) => {
    expect(formatRelativeTime(at, NOW)).toBe(text);
  });
});

describe('useRelativeTime', () => {
  it('formats against the shared clock', () => {
    const scope = effectScope();
    scope.run(() => {
      const { now, relative } = useRelativeTime();
      now.value = NOW;
      expect(relative(ago(3 * 3_600_000))).toBe('3 小时前');
    });
    scope.stop();
  });
});
