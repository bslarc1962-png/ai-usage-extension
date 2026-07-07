import type { UsageState, UsageStatus } from '../shared/types';
import { getUsageTone } from '../shared/utils';

/**
 * Toolbar badge: surfaces the single highest usage percentage across both
 * providers and both windows, so the icon shows "how close am I to a limit"
 * without opening the popup. Colour follows the same ok/warning/critical tone
 * as the meters (see USAGE_THRESHOLDS).
 */

const BADGE_COLORS: Record<UsageStatus, string> = {
  ok: '#16a34a',
  warning: '#d97706',
  critical: '#dc2626',
};

/** Highest percentage across claude/codex session & weekly windows, or null. */
const maxPercentage = (state: UsageState): number | null => {
  const percentages: number[] = [];

  for (const usage of [state.claude, state.codex]) {
    if (!usage) continue;
    percentages.push(usage.session.percentage, usage.weekly.percentage);
  }

  return percentages.length > 0 ? Math.max(...percentages) : null;
};

/**
 * Reflect the current usage snapshot on the toolbar badge. Clears the badge
 * when there is no data yet so a stale number never lingers.
 */
export const updateBadge = async (state: UsageState): Promise<void> => {
  const percent = maxPercentage(state);

  if (percent === null) {
    await chrome.action.setBadgeText({ text: '' });
    return;
  }

  const rounded = Math.round(percent);
  await chrome.action.setBadgeText({ text: String(rounded) });
  await chrome.action.setBadgeBackgroundColor({ color: BADGE_COLORS[getUsageTone(rounded)] });
};
