# 架構說明（Architecture）

> 本文件說明 **AI Usage Tracker** 這個 Chrome MV3 擴充功能的整體架構、資料流、
> 各執行環境的職責，以及在地化與建置流程。程式碼路徑、識別字與 API 名稱一律
> 保留英文原文，以便對照原始碼。

## 目錄

- [總覽](#總覽)
- [執行環境（Contexts）](#執行環境contexts)
- [資料流](#資料流)
- [目錄結構](#目錄結構)
- [核心模組](#核心模組)
- [訊息協定](#訊息協定)
- [儲存鍵（Storage Keys）](#儲存鍵storage-keys)
- [外部 API 端點](#外部-api-端點)
- [在地化（i18n）](#在地化i18n)
- [建置與發佈](#建置與發佈)
- [設計取捨](#設計取捨)

## 總覽

本擴充功能追蹤使用者在 **Claude**（claude.ai）與 **Codex/ChatGPT**（chatgpt.com）
上的用量限額，涵蓋兩個時間視窗：

- **工作階段視窗（session）** — 5 小時。
- **每週視窗（weekly）** — 7 天。

結果會呈現在三個介面：

1. **彈出視窗（sidepanel/popup）** — 點選工具列圖示後開啟的 React UI。
2. **頁面浮層（content overlay）** — 直接注入 claude.ai / chatgpt.com 頁面的膠囊小工具。
3. **工具列徽章（badge）** — 於 README 中列為功能，但目前尚未實作（詳見
   [檢查報告](./REVIEW.zh-TW.md#1-工具列徽章尚未實作)）。

核心設計原則：**擷取與呈現分離**。只有背景 service worker 會對外抓取資料；所有
UI 介面都是無狀態的讀取端，透過 `chrome.storage.local` 取得同一份快照。

## 執行環境（Contexts）

Chrome 擴充功能由數個彼此隔離、無法直接共享記憶體的執行環境組成。本專案的溝通
一律經由具型別的訊息層與共用儲存。

```
┌─────────────────────────────────────────────────────────────┐
│                    background (service worker)              │
│  chrome.alarms（每 5 分鐘） ──► UsageService.refreshAllUsage │
│  chrome.runtime.onMessage ('REFRESH_USAGE') ──► 同上         │
│                        │                                     │
│                        ▼                                     │
│            chrome.storage.local（UsageState 快照）          │
└───────────────┬─────────────────────────┬───────────────────┘
                │ onChanged               │ onChanged
                ▼                         ▼
     ┌────────────────────┐    ┌──────────────────────────┐
     │ sidepanel (popup)  │    │ content overlay          │
     │ useUsageData()     │    │ claude.ai / chatgpt.com  │
     │ 讀取 + 觸發更新     │    │ 讀取 + 觸發更新           │
     └────────────────────┘    └──────────────────────────┘
```

| 執行環境 | 進入點 | 職責 |
| --- | --- | --- |
| **background** | `src/background/index.ts` | 註冊 alarm、處理 `REFRESH_USAGE` 訊息、呼叫 `UsageService`。 |
| **content** | `src/content/index.tsx` | 在服務供應商頁面掛載頁面浮層、讀取快照、觸發更新。 |
| **sidepanel** | `src/sidepanel/main.tsx` → `App.tsx` | 彈出視窗 UI，經由 `useUsageData` hook 讀取快照。 |
| **shared** | `src/shared/**` | 跨環境共用的型別、常數、工具函式、訊息協定，**不匯入任何特定環境的程式碼**。 |

## 資料流

1. **觸發**：alarm 到期（每 5 分鐘）、擴充功能安裝/啟動，或任一 UI 送出
   `REFRESH_USAGE` 訊息。
2. **抓取**：`UsageService.refreshAllUsage()` 以 `Promise.all` 平行抓取 Claude 與
   Codex 兩邊的用量；任一邊失敗都會被個別 catch 成 `null`，不影響另一邊。
3. **解析**：原始 JSON 被正規化成 `UsageLimit`（`percentage`、`resetsAt`），並依門檻
   算出 `status`（ok / warning / critical）。
4. **持久化**：合併後的 `UsageState` 寫入 `chrome.storage.local`。
5. **散播**：每個 UI 都訂閱 `chrome.storage.onChanged`，因此快照一更新就即時重繪，
   無需輪詢。

> 抓取失敗採「保留舊值」策略：`refreshAllUsage` 只在新資料成功時覆寫對應的
> provider 欄位，暫時性的網路錯誤不會清空既有畫面。

## 目錄結構

```text
src/
  background/
    index.ts                 # service worker 進入點：alarm、訊息、生命週期
    services/
      UsageService.ts        # 抓取 + 解析 Claude / Codex API
  content/
    index.tsx                # 頁面浮層（React）與掛載邏輯
    styles/overlay.css       # 浮層樣式（透過 manifest 注入）
  sidepanel/
    main.tsx                 # React 進入點
    App.tsx                  # 彈出視窗版面
    components/              # ProviderCard、UsageCard、UsageMetric、ProgressBar
    hooks/useUsageData.ts    # 彈出視窗的資料生命週期
    styles/global.css
  shared/
    constants.ts             # STORAGE_KEYS、REFRESH_ALARM、USAGE_THRESHOLDS
    i18n.ts                  # msg() — 包裝 chrome.i18n 並提供英文備援
    messaging.ts             # readUsageState、requestUsageRefresh
    types/index.ts           # 領域型別與訊息協定
    utils/index.ts           # clampPercent、getUsageTone、formatReset、formatRelativeTime
    hooks/useNow.ts          # 依固定間隔重繪的時間戳 hook
public/
  _locales/<locale>/messages.json   # Chrome i18n 字串（各語言）
  icons/                             # 擴充功能圖示
manifest.json               # MV3 設定：權限、host、service worker、content script
```

## 核心模組

### `UsageService`（`src/background/services/UsageService.ts`）

唯一對外發出網路請求的模組。重點方法：

- `refreshAllUsage()` — 平行抓取兩邊、合併並儲存。
- `fetchClaudeUsage()` — 先解析組織 ID（見下），再打 usage 端點；遇 401/403
  會清掉快取的組織 ID，使下次重新解析。
- `fetchCodexUsage()` — 先取得短效存取權杖，再帶著 `Bearer` 標頭打 usage 端點。
- `resolveClaudeOrgId()` — 依序嘗試：`chrome.storage.local` 快取 → `lastActiveOrg`
  cookie → `/api/organizations` 清單；解析成功後快取起來。

解析器（`readString`、`readNumber`、`isObject` 等）刻意寫成防禦式，把未知形狀的
JSON 安全收斂成型別化的領域物件，任何缺漏欄位都退回安全預設值。

### `useUsageData`（`src/sidepanel/hooks/useUsageData.ts`）

掌管彈出視窗的整個資料生命週期：初次讀取快照與偏好設定、訂閱 `storage.onChanged`、
提供 `refresh()` 與浮層開關的 setter。元件本身維持純呈現。

### `msg`（`src/shared/i18n.ts`）

薄薄一層包住 `chrome.i18n.getMessage`，並在缺少 runtime（例如測試或非擴充環境）時
回退到內建的英文 `FALLBACK_MESSAGES`，同時支援 `$1` 佔位字串替換。

## 訊息協定

型別定義於 `src/shared/types/index.ts`：

```ts
type ExtensionMessage = { type: 'REFRESH_USAGE' };

type MessageResponse<T> =
  | { success: true; data: T }
  | { success: false; error: string };

type RefreshUsageResponse = MessageResponse<UsageState>;
```

UI 端一律透過 `src/shared/messaging.ts` 的 `requestUsageRefresh()` 送訊息，而非直接
呼叫 `chrome.runtime.sendMessage`，讓錯誤處理集中在一處。

## 儲存鍵（Storage Keys）

集中定義於 `src/shared/constants.ts` 的 `STORAGE_KEYS`：

| 鍵 | 用途 |
| --- | --- |
| `ai_usage_state` | 最新的 `UsageState` 快照。 |
| `claude_org_id` | 快取的 Claude 組織 ID，用來組出 usage 端點。 |
| `claude_overlay_enabled` / `codex_overlay_enabled` | 各服務浮層是否顯示。 |
| `claude_overlay_collapsed` / `codex_overlay_collapsed` | 浮層是否收合成側邊分頁。 |

其他常數：`REFRESH_ALARM = 'refreshUsage'`、`REFRESH_INTERVAL_MINUTES = 5`、
`USAGE_THRESHOLDS = { warning: 75, critical: 92 }`。

## 外部 API 端點

全部都是使用者**已登入**帳號的自有端點，一律帶 `credentials: 'include'`：

| 供應商 | 端點 | 用途 |
| --- | --- | --- |
| Claude | `GET /api/organizations` | 解析組織 ID。 |
| Claude | `GET /api/organizations/{id}/usage` | 讀取 5 小時與 7 天視窗用量。 |
| Codex | `GET /api/auth/session`（chatgpt.com） | 取得短效存取權杖與帳號 ID。 |
| Codex | `GET /backend-api/wham/usage` | 讀取速率限制視窗。 |

> Codex 的存取權杖只存在記憶體中、用於單次請求，**不會**寫入 storage。

## 在地化（i18n）

介面字串走 Chrome 原生的 `_locales` 機制；`manifest.json` 以 `__MSG_key__` 佔位字串
引用（如 `name`、`description`），執行時由 Chrome 依瀏覽器語系解析。

每種語言各需兩份檔案：

- `public/_locales/<locale>/messages.json` — 執行時介面字串，鍵必須與 `en` **完全一致**。
- `store/<locale>/listing.md` — Chrome Web Store 上架文案（Name / Short Description /
  Full Description / Keywords / Single Purpose）。

`tests/store.test.js` 為發佈前的守門測試，會強制：

- 每個語言的 `messages.json` 鍵集合與 `en` 相同，且 `appDescription` ≤ 132 字。
- 每份 `listing.md` 具備必要標題，短描述 ≤ 132 字、完整描述 ≥ 600 字、關鍵字 ≥ 5 個。

### 新增一種語言

1. 建立 `public/_locales/<locale>/messages.json`（複製 `en` 後翻譯所有 `message` 值）。
2. 建立 `store/<locale>/listing.md`（可參考既有語言的結構）。
3. 將 `<locale>` 加入 `tests/store.test.js` 的 `localizedStoreLocales` 陣列。
4. 執行 `node --test tests/store.test.js` 確認全部通過。

> **繁體中文（`zh_TW`）** 即依此流程新增，與既有的簡體中文（`zh_CN`）並存。

## 建置與發佈

- **建置**：Vite（`vite.config.ts`）搭配 `vite-plugin-web-extension` 與
  `@vitejs/plugin-react`。`@sidepanel`、`@background`、`@content`、`@shared` 為路徑別名。
- **樣式**：Tailwind CSS + PostCSS / Autoprefixer。
- **型別檢查**：`tsc --noEmit`（`pnpm build` 會先跑）。
- **發佈**：`pnpm release` = 測試 → 建置 → 用 `scripts/release.js` 封裝 `dist/` 成 zip。
- **版本**：`pnpm bump` 同步遞增 `package.json` 與 `manifest.json` 的 patch 版本。
- **CI**：`.github/workflows/ci.yml`；發佈由 `.github/workflows/release.yml` 處理。

## 設計取捨

- **背景集中抓取，UI 只讀**：避免多個介面重複打 API，並讓所有畫面天然同步。
- **防禦式解析**：外部 API 形狀可能隨時改變，因此每個欄位都經過型別守衛與安全預設，
  寧可顯示 0% 也不讓 UI 崩潰。
- **Cookie 優先解析組織 ID**：先讀 `lastActiveOrg` cookie，多數情況可省下一次
  `/api/organizations` 請求。
- **保留舊值**：暫時性抓取失敗不會清空既有快照。
- **樣式隔離的現況**：浮層以 `aiu-` 前綴的類別搭配透過 manifest 注入的 CSS 做隔離。
  README 描述為 Shadow DOM，但目前的實作並未真正使用 Shadow DOM（詳見
  [檢查報告](./REVIEW.zh-TW.md#3-頁面浮層並非真正的-shadow-dom)）。
