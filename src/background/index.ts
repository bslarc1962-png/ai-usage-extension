import { REFRESH_ALARM, REFRESH_INTERVAL_MINUTES } from '../shared/constants';
import type { ExtensionMessage, RefreshUsageResponse, UsageState } from '../shared/types';
import { updateBadge } from './badge';
import { UsageService } from './services/UsageService';

const refreshUsage = async (): Promise<UsageState> => {
  const state = await UsageService.refreshAllUsage();
  await updateBadge(state);
  return state;
};

// Restore the badge from the last snapshot when the service worker wakes,
// so the icon isn't blank until the next scheduled refresh completes.
void UsageService.getUsageState()
  .then(updateBadge)
  .catch(() => undefined);

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create(REFRESH_ALARM, { periodInMinutes: REFRESH_INTERVAL_MINUTES });
  void refreshUsage().catch(() => undefined);
});

chrome.runtime.onStartup.addListener(() => {
  void refreshUsage().catch(() => undefined);
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === REFRESH_ALARM) {
    void refreshUsage().catch(() => undefined);
  }
});

chrome.runtime.onMessage.addListener(
  (message: ExtensionMessage, _sender, sendResponse: (response: RefreshUsageResponse) => void) => {
    if (message?.type !== 'REFRESH_USAGE') {
      return undefined;
    }

    refreshUsage()
      .then((state) => sendResponse({ success: true, data: state }))
      .catch((error: unknown) => {
        sendResponse({
          success: false,
          error: error instanceof Error ? error.message : 'refresh_failed',
        });
      });

    return true;
  },
);
