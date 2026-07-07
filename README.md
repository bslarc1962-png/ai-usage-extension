# AI Usage Tracker（AI 用量追蹤器）

[![CI](https://github.com/bslarc1962-png/ai-usage-extension/actions/workflows/ci.yml/badge.svg)](https://github.com/bslarc1962-png/ai-usage-extension/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

**語言：** **繁體中文** · [繁體中文 (詳細版)](./README.zh-TW.md)

一款 Chrome 擴充功能（Manifest V3），用來追蹤你的 **Claude** 與 **Codex** 用量限額——同時涵蓋 5 小時的工作階段視窗與 7 天的每週視窗——並將結果呈現在彈出視窗、頁面浮層與工具列圖示徽章上。

> 📄 相關文件：[架構說明](./docs/ARCHITECTURE.zh-TW.md) · [安全性與效能檢查報告](./docs/REVIEW.zh-TW.md)

## 功能特色

- **即時限額**：顯示 Claude 與 Codex 的已用百分比、原始次數與距離重置的時間。
- **工具列徽章**：在擴充功能圖示上以顏色標示目前最高的用量百分比，依 ok／warning／critical 門檻變換綠／琥珀／紅色，不必開啟彈出視窗就能掌握。
- **頁面浮層**：在 `claude.ai` 上以可收合的膠囊呈現，避免與宿主頁面樣式衝突。
- **背景自動更新**：透過 `chrome.alarms` 每 5 分鐘更新一次，也可隨選手動更新。
- **隱私優先**：用量資料只從你自己已驗證的 Claude 與 OpenAI 工作階段讀取。沒有外部伺服器、沒有帳號、不做追蹤。

## 安裝與建置

本擴充功能並未透過 npm 發佈。一般使用時，請從 GitHub releases 頁面安裝已封裝的版本，或在 Chrome 中載入本機建置。

> **💡 提示：關於是否一定需要 Node.js？**
> - **如果您沒有安裝 Node.js（直接載入使用）**：**完全不需要安裝 Node.js！** 本專案已將編譯好的 `dist/` 資料夾提交至 Git 中，您只需下載或 Clone 本專案，就能直接進入 [載入至 Chrome 瀏覽器](#載入至-chrome-瀏覽器) 步驟使用！
> - **如果您想要修改原始碼並重新編譯 (Build)**：才需要安裝 Node.js (20+ 版本) 與相依套件。

### ⚡ 快速安裝（免安裝 Node.js、免編譯）

如果您沒有安裝 Node.js，或者不想手動執行編譯指令，請依照以下步驟直接載入：
1. 點選 GitHub 頁面右上角的 **「Code ➡️ Download ZIP」**（或使用 `git clone`），將本專案下載到電腦中並解壓縮。
2. 直接跳到下方的 **[載入至 Chrome 瀏覽器](#載入至-chrome-瀏覽器)** 步驟，選擇解壓縮目錄中的 `dist/` 資料夾即可直接使用！

### 🛠️ 從原始碼編譯建置（提供兩種方式，適合開發者或有 Node.js 的用戶）

#### 方式一：推薦做法（Windows 免系統管理員權限、不報錯）
在 Windows 系統下，執行 `corepack enable` 常因嘗試寫入 `C:\Program Files\nodejs\` 而導致 `EPERM` 權限不足錯誤。建議改用以下 `npm` 或 `npx` 指令直接進行安裝與編譯：

```bash
# 方法 A：使用 npx 一鍵安裝套件與建置（最推薦，保證零路徑問題）
npx pnpm@9.15.0 install
npx pnpm@9.15.0 build

# 方法 B：先用 npm 安裝 pnpm 到個人使用者目錄，再進行建置
npm install -g pnpm@9.15.0
pnpm install
pnpm build
```

#### 方式二：使用 Corepack（若在 Windows 需以「系統管理員」身分執行 PowerShell）
```bash
corepack enable
pnpm install
pnpm build
```

### 載入至 Chrome 瀏覽器

1. 開啟 `chrome://extensions`。
2. 啟用右上角的 **開發人員模式**。
3. 點選左上角的 **載入未封裝項目**，選擇建置出來的 `dist/` 目錄。
4. 登入 `claude.ai` 與 `chatgpt.com`，然後開啟擴充功能彈出視窗並點選重新整理。

## 架構

本擴充功能拆分成數個彼此隔離的執行環境（context），透過一層具型別的訊息機制溝通：

```text
src/
  background/   # Service worker：排程、抓取、徽章更新
  content/      # claude.ai 頁面浮層（React）
  sidepanel/    # 彈出視窗 UI（React）
  shared/       # 跨環境共用層 — 不匯入任何特定環境的程式碼
```

**資料流：** 背景 worker 抓取用量後，把一份 `UsageState` 快照寫入 `chrome.storage.local` 並更新徽章。彈出視窗與浮層讀取這份快照，並訂閱 `chrome.storage.onChanged`，因此每個介面都保持同步。

完整說明請見 [docs/ARCHITECTURE.zh-TW.md](./docs/ARCHITECTURE.zh-TW.md)。

## 開始開發

### 需求

- Node.js 20 或更新版本
- 支援 Manifest V3 擴充功能的 Chrome 或其他 Chromium 瀏覽器

### 安裝相依套件

```bash
# 推薦做法 (免系統管理員權限)：
npx pnpm@9.15.0 install
# 或使用 npm 全域安裝：
npm install -g pnpm@9.15.0 && pnpm install
```

### 開發與驗證

```bash
pnpm dev    # 建置到 dist/ 並監看檔案變更
pnpm build  # 產生正式版建置
pnpm test   # 執行測試
```

## 授權與致謝

本專案採用 [MIT License](./LICENSE) 授權。
特別感謝原作者 [cupcakedev](https://github.com/cupcakedev/ai-usage-extension) 的核心專案，本專案在此基礎上進行了繁體中文化與 Windows 免安裝體驗的擴充與維護。
