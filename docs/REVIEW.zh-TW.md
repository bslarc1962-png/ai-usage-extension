# 安全性與效能檢查報告

> 對 **AI Usage Tracker** 進行的靜態程式碼檢查，聚焦於安全性、隱私、效能與
> 文檔一致性。每項發現都附上檔案位置與建議。嚴重度分級：
> 🔴 高 / 🟠 中 / 🟡 低 / 🟢 良好實務。
>
> 檢查日期：2026-07-07 · 檢查版本：`manifest.json` v0.1.3

## 摘要

整體而言這是一個設計良好、注重隱私的擴充功能：所有資料都來自使用者自己已登入的
工作階段，沒有外部伺服器、沒有遙測，權限也逐項有文件佐證。以下發現多屬**文檔與
實作不一致**及**效能最佳化**，沒有發現高風險的資料外洩漏洞。

| # | 類別 | 嚴重度 | 標題 |
| --- | --- | --- | --- |
| 1 | 文檔一致性 | 🟠 中 | 工具列徽章尚未實作 |
| 2 | 效能 | 🟠 中 | 頁面浮層使用兩個全頁 MutationObserver 且未節流 |
| 3 | 文檔一致性 | 🟡 低 | 頁面浮層並非真正的 Shadow DOM |
| 4 | 隱私 / 儲存 | 🟡 低 | 完整 `raw` API 回應被寫入 storage |
| 5 | 相依套件 | 🟡 低 | `react-shadow` 為未使用的相依套件 |
| 6 | 建置 / CI | 🟡 低 | `pnpm test` 指令在新版 Node 下無法掃描目錄 |
| 7 | 安全性 | 🟢 良好 | 存取權杖與 cookie 的處理方式 |

---

## 1. 工具列徽章尚未實作

**嚴重度：🟠 中（文檔一致性）**

`README.md`、`README.zh-TW.md` 與各語言的商店文案都把「工具列徽章（toolbar badge）
一眼顯示目前最高用量」列為功能，但整個程式庫中**沒有任何** `chrome.action.setBadgeText`
或 `setBadgeBackgroundColor` 的呼叫，`manifest.json` 也未宣告 `action` 的預設徽章。

- `src/background/index.ts`：`refreshUsage()` 只更新 storage，未更新徽章。
- `manifest.json`：`action` 僅設定 `default_popup` 與 `default_title`。

**影響**：對使用者與商店審查者形成功能不實的宣稱。

**建議（擇一）**：

- **實作**（推薦，因為已經對外宣傳）：在背景取得用量後，計算兩個 provider、
  兩個視窗的最高百分比，呼叫 `chrome.action.setBadgeText({ text })` 與
  `setBadgeBackgroundColor`（顏色可沿用 `USAGE_THRESHOLDS` 的 ok/warning/critical 分級）。
  這是一段內聚且低風險的新增，可放進 `UsageService.refreshAllUsage` 之後。
- 或**暫時修正文檔**：在功能未上線前，先從 README 與商店文案移除徽章相關描述。

---

## 2. 頁面浮層使用兩個全頁 MutationObserver 且未節流

**嚴重度：🟠 中（效能）**

`src/content/index.tsx` 在 claude.ai / chatgpt.com 上註冊了兩個 `MutationObserver`，
且都以 `document.documentElement` 搭配 `{ childList: true, subtree: true }` 觀察**整頁**：

1. `UsageOverlay` 內的 `checkElement`（約 L94–110）：每次 DOM 變動都執行一次
   `document.querySelector(inputSelector)`。
2. `mount` 內的 `watcher`（約 L303–311）：每次 DOM 變動都檢查 `hostRef.isConnected`。

這兩個網站都是變動頻繁的重量級 SPA，因此上述回呼會被**極高頻**觸發，每次還可能
帶一次跨整個 DOM 的 `querySelector`。在長對話或串流輸出時，可能造成明顯的主執行緒
負擔。

**建議**：

- 對回呼加上節流／防抖（例如 `requestAnimationFrame` 合併，或 100–250ms 的 debounce），
  多次連續變動只重新計算一次。
- 可考慮縮小觀察範圍（例如只觀察已知的聊天容器，而非整個 `documentElement`），
  或降低對 `subtree` 的依賴。
- 兩個觀察器目的相近（確認輸入框存在／宿主節點仍在），可評估合併為單一節流回呼。

---

## 3. 頁面浮層並非真正的 Shadow DOM

**嚴重度：🟡 低（文檔一致性 / 樣式隔離）**

README 與商店文案宣稱浮層「以 Shadow DOM 呈現，避免與宿主頁面樣式衝突」。實際上
`src/content/index.tsx` 是把一個一般的 `<div>`（`HOST_ID`）附加到 `document.documentElement`，
再用 `createRoot(host)` 直接把 React 渲染進去；樣式則透過 `manifest.json` 的
`content_scripts.css`（`overlay.css`）**注入到整個頁面**。

`package.json` 雖然列有 `react-shadow`，但 `src/` 內並未匯入使用（見發現 #5）。

**影響**：實際的樣式隔離只靠 `aiu-` 類別前綴這個命名慣例。宿主頁面若有攻擊性的
全域樣式（如 `* { ... }`、標籤選擇器、`!important` 重設）仍可能影響浮層外觀；反之
`overlay.css` 也可能因選擇器不夠嚴謹而外溢到宿主頁面。這是穩健性/一致性問題，並非
安全漏洞。

**建議**：

- 若要符合文檔敘述，改用 `react-shadow`（已在相依中）或原生 `attachShadow` 將浮層
  包進 Shadow Root，並把樣式改為注入 shadow root 內。
- 若維持現狀，請更新 README／商店文案，改描述為「以 Shadow DOM 隔離」→「以命名空間化
  的樣式隔離」，以免與實作不符。

---

## 4. 完整 `raw` API 回應被寫入 storage

**嚴重度：🟡 低（隱私 / 儲存）**

`src/background/services/UsageService.ts` 的 `buildClaudeUsage` 與 `buildCodexUsage`
會把**整包**原始 API 回應存進 `raw` 欄位（`ClaudeUsage.raw` / `CodexUsage.raw`，見
`src/shared/types/index.ts`），最終隨 `UsageState` 寫入 `chrome.storage.local`。

觀察：

- UI 並未使用 `raw`（浮層與卡片只讀 `session` / `weekly` / `lastUpdated`）。
- 這些回應可能包含超出所需的欄位（組織資訊、方案細節等），形成不必要的靜態資料落地。
- 好消息是：Codex 的**存取權杖不在** `raw` 中——`raw` 存的是 usage 端點回應，而非
  session 端點回應（見發現 #7）。

**建議**：既然 UI 用不到，抓取後即可捨棄 `raw`（不要存入 storage），或只保留少數
需要的欄位。這能同時降低儲存量與資料落地面。

---

## 5. `react-shadow` 為未使用的相依套件

**嚴重度：🟡 低（相依套件衛生）**

`package.json` 的 `dependencies` 列有 `react-shadow`，但 `src/` 內找不到任何匯入
（僅出現在 `package.json` 與 `pnpm-lock.yaml`）。

**建議**：若不打算依發現 #3 導入 Shadow DOM，請移除此相依以縮減安裝體積與供應鏈面；
若打算導入，則正好可用它來落實真正的 Shadow DOM。

---

## 6. `pnpm test` 指令在新版 Node 下無法掃描目錄

**嚴重度：🟡 低（建置 / CI）**

`package.json` 的 test script 為 `node --test tests/`。在本檢查環境（Node v22）下，
此寫法會以 `Cannot find module '.../tests'` 失敗；改用 `node --test tests/store.test.js`
（或 `node --test 'tests/**/*.test.js'`）則 36 項測試全數通過。

**影響**：專案 README 標示需求為 Node 20，於該版本可正常運作；但若開發者或 CI 使用
較新版 Node，`pnpm test` 與相依它的 `pnpm release` 可能失敗。

**建議**：把 script 改為明確的檔案模式，例如：

```json
"test": "node --test tests/*.test.js"
```

以跨 Node 版本穩定運作。

---

## 7. 存取權杖與 cookie 的處理方式（良好實務）

**嚴重度：🟢 良好實務**

值得肯定的既有做法：

- **Codex 存取權杖僅存在記憶體**：`fetchCodexSession()` 取得的 `accessToken` 只在
  單次請求的 `Authorization` 標頭中使用，**不寫入** storage。
- **Cookie 為唯讀且僅限單一鍵**：`claudeOrgFromCookie()` 只讀 claude.ai 的
  `lastActiveOrg`，從不寫入，也不外傳。
- **無 `eval` / 無 `innerHTML`**：UI 全走 React，未使用 `dangerouslySetInnerHTML`。
- **權限最小化且有文件**：每個 `permissions` / `host_permissions` 都在
  `store/permissions.md` 有對應說明，並由測試強制檢查。
- **防禦式解析**：對外部 JSON 一律經型別守衛與安全預設，避免 API 形狀改變導致 UI 崩潰。

這些設計是本擴充功能「隱私優先」定位的良好基礎，建議維持。

---

## 建議處理順序

1. **決定徽章去留**（發現 #1）——實作或修正文檔，因為它已對外宣傳。
2. **為浮層觀察器加上節流**（發現 #2）——對重度使用者最有感的效能改善。
3. **停止持久化 `raw`**（發現 #4）——一行改動即可縮小資料落地面。
4. **修正 test script**（發現 #6）——保障 CI 穩定。
5. **釐清 Shadow DOM 與 `react-shadow`**（發現 #3、#5）——導入或改述，二擇一。
