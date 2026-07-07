# 測試說明（Testing）

> 本文件說明本專案的測試分層、涵蓋範圍、執行方式，以及如何新增測試。
> 程式路徑與識別字保留英文以對照原始碼。

## 兩層測試

| 層級 | 工具 | 位置 | 測什麼 |
| --- | --- | --- | --- |
| **發佈前守門（release gate）** | `node --test` | `tests/*.test.js` | Chrome Web Store 中繼資料的一致性：locale 檔鍵值與 `en` 相同、商店文案長度合規、權限有文件、宣傳圖存在。 |
| **單元測試（unit）** | [Vitest](https://vitest.dev) | `tests/unit/*.test.ts` | `src/` 內純函式的**行為**：門檻對應、時間格式化、節流、徽章百分比與顏色。 |

兩層互補：守門層保護「上架資料正確」，單元層保護「程式邏輯正確」。CI（`.github/workflows/ci.yml`）會依序跑 `lint → format:check → test → build`，其中 `test` 同時涵蓋這兩層。

## 執行

```bash
pnpm test          # 兩層都跑（= test:store + test:unit）
pnpm test:store    # 只跑發佈前守門測試（node --test）
pnpm test:unit     # 只跑單元測試（vitest run）
pnpm test:unit --watch   # 開發時監看模式
```

## 目前涵蓋範圍

單元測試集中在**無副作用、易驗證**的純函式：

- **`src/shared/utils`**
  - `clampPercent` — 四捨五入並夾在 0–100。
  - `getUsageTone` — 依 `USAGE_THRESHOLDS` 對應 ok / warning / critical（含邊界 75、92）。
  - `formatReset` — `null → unknown`、已過期 → `now`、分鐘／時分／日時格式。
  - `formatRelativeTime` — `just now`／分／時／日。
  - `throttle` — leading 立即觸發、爆量合併為單次 trailing（取最新引數）、`cancel()` 可取消待觸發。
- **`src/background/badge`**
  - `maxPercentage` — 跨 Claude／Codex × session／weekly 取最大值，無資料回 `null`。
  - `updateBadge` — 無資料清空徽章；有資料顯示四捨五入百分比並依門檻上色（以 mock 的 `chrome.action` 驗證）。

> `msg()`（`src/shared/i18n.ts`）在缺少 `chrome.i18n` 時會退回內建英文字串，因此 vitest
> 在 node 環境下可直接測試依賴 `msg()` 的格式化函式，無需 mock Chrome runtime。

## 尚未涵蓋（可日後補強）

- **React 元件與 hooks**（`sidepanel/`、`content/`、`useUsageData`、`useNow`）——需要
  jsdom + React Testing Library。
- **`UsageService` 的抓取／解析**——需 mock `fetch` 與 `chrome.storage` / `chrome.cookies`。
- **端對端（E2E）**——可用 Playwright 實際載入擴充功能操作。

## 如何新增單元測試

1. 在 `tests/unit/` 建立 `<名稱>.test.ts`。
2. 從 `vitest` 匯入所需 API，並從 `../../src/...` 匯入待測程式：

   ```ts
   import { describe, it, expect } from 'vitest';
   import { getUsageTone } from '../../src/shared/utils';

   describe('getUsageTone', () => {
     it('maps 92% to critical', () => {
       expect(getUsageTone(92)).toBe('critical');
     });
   });
   ```

3. 需要假時鐘時用 `vi.useFakeTimers()` / `vi.advanceTimersByTime()`；需要 Chrome API 時，
   在 `beforeEach` 把 `globalThis.chrome` 設為最小 mock（參考 `tests/unit/badge.test.ts`）。
4. 執行 `pnpm test:unit` 確認通過。

> 註：`tsconfig.json` 的 `include` 僅涵蓋 `src`，因此 `tsc`（型別檢查與 build）不會編譯測試
> 檔；型別由 Vitest 的 esbuild 於執行時處理。ESLint 與 Prettier 也只作用於 `src`，測試檔不
> 受其守門。
