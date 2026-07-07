import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { maxPercentage, updateBadge } from '../../src/background/badge';
import type { ClaudeUsage, CodexUsage, UsageState } from '../../src/shared/types';

const claude = (session: number, weekly: number): ClaudeUsage => ({
  plan: 'unknown',
  session: { percentage: session, resetsAt: null },
  weekly: { percentage: weekly, resetsAt: null },
  status: 'ok',
  lastUpdated: 0,
});

const codex = (session: number, weekly: number): CodexUsage => ({
  session: { percentage: session, resetsAt: null },
  weekly: { percentage: weekly, resetsAt: null },
  status: 'ok',
  lastUpdated: 0,
});

describe('maxPercentage', () => {
  it('returns null when there is no usage data', () => {
    expect(maxPercentage({})).toBeNull();
  });

  it('takes the max across a single provider', () => {
    expect(maxPercentage({ claude: claude(30, 62) })).toBe(62);
  });

  it('takes the max across both providers and windows', () => {
    const state: UsageState = { claude: claude(30, 62), codex: codex(88, 10) };
    expect(maxPercentage(state)).toBe(88);
  });
});

describe('updateBadge', () => {
  const setBadgeText = vi.fn().mockResolvedValue(undefined);
  const setBadgeBackgroundColor = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    (globalThis as { chrome?: unknown }).chrome = {
      action: { setBadgeText, setBadgeBackgroundColor },
    };
  });

  afterEach(() => {
    delete (globalThis as { chrome?: unknown }).chrome;
    vi.clearAllMocks();
  });

  it('clears the badge when there is no data', async () => {
    await updateBadge({});
    expect(setBadgeText).toHaveBeenCalledWith({ text: '' });
    expect(setBadgeBackgroundColor).not.toHaveBeenCalled();
  });

  it('shows the rounded max percentage with an ok colour', async () => {
    await updateBadge({ claude: claude(10, 5) });
    expect(setBadgeText).toHaveBeenCalledWith({ text: '10' });
    expect(setBadgeBackgroundColor).toHaveBeenCalledWith({ color: '#16a34a' });
  });

  it('uses the warning colour at the warning threshold', async () => {
    await updateBadge({ codex: codex(87, 20) });
    expect(setBadgeText).toHaveBeenCalledWith({ text: '87' });
    expect(setBadgeBackgroundColor).toHaveBeenCalledWith({ color: '#d97706' });
  });

  it('uses the critical colour at the critical threshold', async () => {
    await updateBadge({ claude: claude(95, 40) });
    expect(setBadgeText).toHaveBeenCalledWith({ text: '95' });
    expect(setBadgeBackgroundColor).toHaveBeenCalledWith({ color: '#dc2626' });
  });
});
