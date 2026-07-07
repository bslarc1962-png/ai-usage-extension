import { describe, it, expect, vi } from 'vitest';
import {
  clampPercent,
  getUsageTone,
  formatReset,
  formatRelativeTime,
  throttle,
} from '../../src/shared/utils';

// `msg()` falls back to its built-in English strings when `chrome.i18n` is
// absent (as it is under vitest), so these assertions use the fallback copy.

describe('clampPercent', () => {
  it('rounds to the nearest integer', () => {
    expect(clampPercent(49.4)).toBe(49);
    expect(clampPercent(49.6)).toBe(50);
  });

  it('clamps into the inclusive 0–100 range', () => {
    expect(clampPercent(-20)).toBe(0);
    expect(clampPercent(0)).toBe(0);
    expect(clampPercent(100)).toBe(100);
    expect(clampPercent(150)).toBe(100);
  });
});

describe('getUsageTone', () => {
  it('maps percentages to ok / warning / critical by threshold', () => {
    expect(getUsageTone(0)).toBe('ok');
    expect(getUsageTone(74)).toBe('ok');
    expect(getUsageTone(75)).toBe('warning'); // warning threshold
    expect(getUsageTone(91)).toBe('warning');
    expect(getUsageTone(92)).toBe('critical'); // critical threshold
    expect(getUsageTone(100)).toBe('critical');
  });

  it('clamps out-of-range input before mapping', () => {
    expect(getUsageTone(-5)).toBe('ok');
    expect(getUsageTone(1000)).toBe('critical');
  });
});

describe('formatReset', () => {
  it('returns "unknown" for a null reset time', () => {
    expect(formatReset(null, 0)).toBe('unknown');
  });

  it('returns "now" once the reset time has passed', () => {
    expect(formatReset(new Date(0).toISOString(), 60_000)).toBe('now');
  });

  it('formats minutes, hours+minutes, and days+hours', () => {
    const now = 0;
    expect(formatReset(new Date(45 * 60_000).toISOString(), now)).toBe('45m');
    expect(formatReset(new Date((2 * 60 + 13) * 60_000).toISOString(), now)).toBe('2h 13m');
    expect(formatReset(new Date(27 * 60 * 60_000).toISOString(), now)).toBe('1d 3h');
  });
});

describe('formatRelativeTime', () => {
  it('labels a fresh timestamp as "just now"', () => {
    expect(formatRelativeTime(0, 30_000)).toBe('just now');
  });

  it('formats minutes, hours, and days ago', () => {
    expect(formatRelativeTime(0, 5 * 60_000)).toBe('5m ago');
    expect(formatRelativeTime(0, 3 * 60 * 60_000)).toBe('3h ago');
    expect(formatRelativeTime(0, 2 * 24 * 60 * 60_000)).toBe('2d ago');
  });
});

describe('throttle', () => {
  it('invokes on the leading edge immediately', () => {
    vi.useFakeTimers();
    try {
      const fn = vi.fn();
      const throttled = throttle(fn, 100);
      throttled();
      expect(fn).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('coalesces a burst into a single trailing call with the latest args', () => {
    vi.useFakeTimers();
    try {
      const fn = vi.fn();
      const throttled = throttle(fn, 100);

      throttled('a');
      throttled('b');
      throttled('c');
      expect(fn).toHaveBeenCalledTimes(1); // leading only, so far
      expect(fn).toHaveBeenLastCalledWith('a');

      vi.advanceTimersByTime(100);
      expect(fn).toHaveBeenCalledTimes(2); // trailing fired
      expect(fn).toHaveBeenLastCalledWith('c'); // with the newest args
    } finally {
      vi.useRealTimers();
    }
  });

  it('cancel() drops a pending trailing call', () => {
    vi.useFakeTimers();
    try {
      const fn = vi.fn();
      const throttled = throttle(fn, 100);

      throttled();
      throttled(); // schedules a trailing call
      expect(fn).toHaveBeenCalledTimes(1);

      throttled.cancel();
      vi.advanceTimersByTime(500);
      expect(fn).toHaveBeenCalledTimes(1); // trailing never fired
    } finally {
      vi.useRealTimers();
    }
  });
});
