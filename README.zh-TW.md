# AI Usage Tracker（AI 用量追蹤器）

[![CI](https://github.com/cupcakedev/ai-usage-extension/actions/workflows/ci.yml/badge.svg)](https://github.com/cupcakedev/ai-usage-extension/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

**語言：** [English](./README.md) · **繁體中文**

一款 Chrome 擴充功能（Manifest V3），用來追蹤你的 **Claude** 與 **Codex** 用量限額
——同時涵蓋 5 小時的工作階段視窗與 7 天的每週視窗——並將結果呈現在彈出視窗、
頁面浮層與工具列圖示徽章上。

> 📄 相關文件：[架構說明](./docs/ARCHITECTURE.zh-TW.md) ·
> [安全性與效能檢查報告](./docs/REVIEW.zh-TW.md)

## 功能特色

- **即時限額**：顯示 Claude 與 Codex 的已用百分比、原始次數與距離重置的時間。
- **工具列徽章**：在擴充功能圖示上以顏色標示目前最高的用量百分比，
  依 ok／warning／critical 門檻變換綠／琥珀／紅色，不必開啟彈出視窗就能掌握。
- **頁面浮層**：在 `claude.ai` 上以可收合的膠囊呈現，避免與宿主頁面樣式衝突。
- **背景自動更新**：透過 `chrome.alarms` 每 5 分鐘更新一次，也可隨選手動更新。
- **隱私優先**：用量資料只從你自己已驗證的 Claude 與 OpenAI 工作階段讀取。
  沒有外部伺服器、沒有帳號、不做追蹤。

## 安裝

本擴充功能並未透過 npm 發佈。一般使用時，請從 GitHub releases 頁面安裝已封裝的
版本，或在 Chrome 中載入本機建置。

載入本機建置：

```bash
corepack enable
pnpm install
pnpm build
```

接著：

1. 開啟 `chrome://extensions`。
2. 啟用 **開發人員模式**。
3. 點選 **載入未封裝項目**，選擇 `dist/` 目錄。
4. 登入 `claude.ai` 與 `chatgpt.com`，然後開啟彈出視窗並重新整理。

## 架構

本擴充功能拆分成數個彼此隔離的執行環境（context），透過一層具型別的訊息機制溝通：

```text
src/
  background/   # Service worker：排程、抓取、徽章更新
    services/   # UsageService — 抓取並解析各服務供應商 API
  content/      # claude.ai 頁面浮層（React）
  sidepanel/    # 彈出視窗 UI（React）
    components/ # 呈現用元件
    hooks/      # useUsageData — 掌管彈出視窗的資料生命週期
  shared/       # 跨環境共用層 — 不匯入任何特定環境的程式碼
    constants  # 儲存鍵、alarm 名稱、門檻值
    hooks      # 彈出視窗與浮層共用的框架 hook（useNow）
    types      # 領域型別與訊息型別
    utils      # clampPercent、getUsageTone、formatReset、formatRelativeTime
```

**資料流：** 背景 worker 抓取用量後，把一份 `UsageState` 快照寫入
`chrome.storage.local` 並更新徽章。彈出視窗與浮層讀取這份快照，並訂閱
`chrome.storage.onChanged`，因此每個介面都保持同步。

完整說明請見 [docs/ARCHITECTURE.zh-TW.md](./docs/ARCHITECTURE.zh-TW.md)。

## 開始開發

### 需求

- Node.js 20 或更新版本
- 透過 Corepack 使用 pnpm 9.15.0
- 支援 Manifest V3 擴充功能的 Chrome 或其他 Chromium 瀏覽器

### 安裝相依套件

```bash
corepack enable
pnpm install
```

### 開發

```bash
pnpm dev
```

建置到 `dist/` 並監看檔案變更。

### 驗證

```bash
pnpm lint
pnpm format:check
pnpm test
pnpm build
```

## 在地化（i18n）

擴充功能介面與 Chrome Web Store 文案皆已在地化。每種語言各需兩份檔案：

- `public/_locales/<locale>/messages.json` — 擴充功能執行時的介面字串。
- `store/<locale>/listing.md` — 該語言的 Chrome Web Store 上架文案。

目前支援的語言：英文（`en`，預設）、西班牙文、法文、德文、義大利文、
巴西葡萄牙文、俄文、日文、簡體中文（`zh_CN`）、**繁體中文（`zh_TW`）** 與印地文。

`tests/store.test.js` 會強制檢查每個語言的 `messages.json` 與 `en` 的鍵值完全一致，
且商店文案符合 Chrome 的字數限制。新增語言時，請將 locale 代碼加入
`tests/store.test.js` 內的 `localizedStoreLocales` 陣列，並補齊上述兩份檔案。

新增語言的步驟見 [docs/ARCHITECTURE.zh-TW.md 的「在地化」章節](./docs/ARCHITECTURE.zh-TW.md#在地化i18n)。

## 指令

| 指令                 | 說明                                          |
| -------------------- | --------------------------------------------- |
| `pnpm dev`           | 建置並監看以進行開發。                        |
| `pnpm bump`          | 遞增 `package.json` 與 `manifest.json` 的 patch 版本號。 |
| `pnpm build`         | 先型別檢查，再產生正式版建置。               |
| `pnpm release`       | 測試、建置，並將 `dist/` 封裝成 `release/*.zip`。 |
| `pnpm typecheck`     | 執行 `tsc` 但不輸出檔案。                     |
| `pnpm test`          | 執行商店中繼資料的發佈前檢查。               |
| `pnpm lint`          | 以 ESLint 檢查 `src/`。                       |
| `pnpm format`        | 以 Prettier 格式化 `src/`。                   |

## 貢獻

歡迎提出 issue 與 pull request。在提出較大的變更前，請先閱讀
[CONTRIBUTING.md](./CONTRIBUTING.md)。

## 安全性

請勿為疑似漏洞開立公開 issue，改依 [SECURITY.md](./SECURITY.md) 的流程回報。

## 授權

MIT
