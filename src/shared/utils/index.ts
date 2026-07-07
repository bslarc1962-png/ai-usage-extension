import { USAGE_THRESHOLDS } from '../constants';
import { msg } from '../i18n';
import type { UsageStatus } from '../types';

/** @deprecated kept as an alias — prefer `UsageStatus` from shared/types. */
export type UsageTone = UsageStatus;

/** Round a number into the inclusive 0–100 range. */
export const clampPercent = (value: number): number =>
  Math.max(0, Math.min(100, Math.round(value)));

/** Map a usage percentage to its severity tone. */
export const getUsageTone = (value: number): UsageStatus => {
  const percent = clampPercent(value);

  if (percent >= USAGE_THRESHOLDS.critical) {
    return 'critical';
  }

  if (percent >= USAGE_THRESHOLDS.warning) {
    return 'warning';
  }

  return 'ok';
};

/**
 * Human-readable countdown to a reset timestamp.
 * Returns e.g. `2h 13m`, `45m`, `now`, or `unknown`.
 */
export const formatReset = (resetAt: string | null, now: number): string => {
  if (!resetAt) {
    return msg('timeUnknown');
  }

  const diff = new Date(resetAt).getTime() - now;
  if (!Number.isFinite(diff)) {
    return msg('timeUnknown');
  }

  if (diff <= 0) {
    return msg('timeNow');
  }

  const totalMinutes = Math.floor(diff / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    return `${days}${msg('timeDayShort')} ${hours % 24}${msg('timeHourShort')}`;
  }

  if (hours > 0) {
    return `${hours}${msg('timeHourShort')} ${minutes}${msg('timeMinuteShort')}`;
  }

  return `${minutes}${msg('timeMinuteShort')}`;
};

/**
 * Human-readable "time since" label for a past timestamp.
 * Returns e.g. `just now`, `5m ago`, `3h ago`.
 */
export const formatRelativeTime = (timestamp: number, now: number): string => {
  const minutes = Math.floor(Math.max(0, now - timestamp) / 60_000);

  if (minutes < 1) {
    return msg('timeJustNow');
  }

  if (minutes < 60) {
    return msg('timeAgo', `${minutes}${msg('timeMinuteShort')}`);
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return msg('timeAgo', `${hours}${msg('timeHourShort')}`);
  }

  return msg('timeAgo', `${Math.floor(hours / 24)}${msg('timeDayShort')}`);
};

export interface Throttled<A extends unknown[]> {
  (...args: A): void;
  /** Cancel any pending trailing invocation (call on teardown). */
  cancel: () => void;
}

/**
 * Rate-limit `fn` to run at most once per `intervalMs`, leading edge plus a
 * trailing call so the final invocation is never dropped. Used to tame the
 * high-frequency MutationObserver callbacks on SPA host pages, where a single
 * streamed response can fire thousands of mutations.
 */
export const throttle = <A extends unknown[]>(
  fn: (...args: A) => void,
  intervalMs: number,
): Throttled<A> => {
  let last = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: A | null = null;

  const run = (args: A): void => {
    last = Date.now();
    fn(...args);
  };

  const throttled = ((...args: A): void => {
    const remaining = intervalMs - (Date.now() - last);

    if (remaining <= 0) {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      run(args);
      return;
    }

    pending = args;
    if (!timer) {
      timer = setTimeout(() => {
        timer = null;
        if (pending) {
          const args = pending;
          pending = null;
          run(args);
        }
      }, remaining);
    }
  }) as Throttled<A>;

  throttled.cancel = (): void => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    pending = null;
  };

  return throttled;
};
