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
| 1 | 文檔一致性 | ✅ 已修正 | 工具列徽章尚未實作 |
| 2 | 效能 | ✅ 已修正 | 頁面浮層使用兩個全頁 MutationObserver 且未節流 |
| 3 | 文檔一致性 | 🟡 低 | 頁面浮層並非真正的 Shadow DOM |
| 4 | 隱私 / 儲存 | ✅ 已修正 | 完整 `raw` API 回應被寫入 storage |
| 5 | 相依套件 | ✅ 已修正 | `react-shadow` 為未使用的相依套件 |
| 6 | 建置 / CI | ✅ 已修正 | `pnpm test` 指令在新版 Node 下無法掃描目錄 |
| 7 | 安全性 | 🟢 良好 | 存取權杖與 cookie 的處理方式 |

---

## 1. 工具列徽章尚未實作

**嚴重度：✅ 已於本 PR 修正**

原本 `README.md`、`README.zh-TW.md` 與各語言的商店文案都把「工具列徽章（toolbar
badge）一眼顯示目前最高用量」列為功能，但程式庫中**沒有任何** `chrome.action.setBadgeText`
呼叫，形成功能不實的宣稱。

**修正**：新增 `src/background/badge.ts`，並接進 `src/background/index.ts`：

- 每次背景刷新用量後，計算 Claude／Codex × session／weekly 四個視窗的最高百分比，
  以 `chrome.action.setBadgeText` 顯示於工具列圖示。
- 底色沿用 `USAGE_THRESHOLDS` 的 ok／warning／critical 分級
  （綠 `#16a34a`／琥珀 `#d97706`／紅 `#dc2626`）。
- service worker 喚醒時會先從既有快照還原徽章，避免圖示在下次刷新前空白。
- 尚無資料時清空徽章，避免殘留過期數字。

---

## 2. 頁面浮層使用兩個全頁 MutationObserver 且未節流

**嚴重度：✅ 已於本 PR 修正**

原本 `src/content/index.tsx` 在 claude.ai / chatgpt.com 上註冊了兩個 `MutationObserver`，
且都以 `document.documentElement` 搭配 `{ childList: true, subtree: true }` 觀察**整頁**：

1. `UsageOverlay` 內的 `checkElement`：每次 DOM 變動都執行一次
   `document.querySelector(inputSelector)`。
2. `mount` 內的 `watcher`：每次 DOM 變動都檢查 `hostRef.isConnected`。

這兩個網站是變動頻繁的重量級 SPA，單一串流回應就可能觸發**數千次** DOM 變動，
使上述回呼被極高頻呼叫，造成明顯的主執行緒負擔。

**修正**：新增 `throttle`（`src/shared/utils/index.ts`，leading + trailing、上限一次
／`intervalMs`，並提供 `cancel()` 供卸載時清除待觸發的呼叫），並套用到兩個 observer
的回呼（間隔 250ms）：

- `checkElement` 改為 `throttle(checkElement, 250)`，並在 effect cleanup 呼叫 `cancel()`。
- `watcher` 回呼改為 `throttle(reattachIfDetached, 250)`。

如此在串流風暴下，回呼從「每次 mutation（可能上千次／秒）」降為**最多每 250ms 一次**
（約 4 次／秒），同時保留 trailing 呼叫以免漏掉最後一次狀態變化。

**未一併處理（可日後再優化）**：縮小觀察範圍（只觀察聊天容器而非整個
`documentElement`）、或將兩個 observer 合併為單一回呼——屬更進一步的最佳化，非必要。

---

## 3. 頁面浮層並非真正的 Shadow DOM

**嚴重度：🟡 低（文檔一致性 / 樣式隔離）**

README 與商店文案宣稱浮層「以 Shadow DOM 呈現，避免與宿主頁面樣式衝突」。實際上
`src/content/index.tsx` 是把一個一般的 `<div>`（`HOST_ID`）附加到 `document.documentElement`，
再用 `createRoot(host)` 直接把 React 渲染進去；樣式則透過 `manifest.json` 的
`content_scripts.css`（`overlay.css`）**注入到整個頁面**。

（`react-shadow` 這個未使用的相依已於本 PR 移除，見發現 #5。）

**影響**：實際的樣式隔離只靠 `aiu-` 類別前綴這個命名慣例。宿主頁面若有攻擊性的
全域樣式（如 `* { ... }`、標籤選擇器、`!important` 重設）仍可能影響浮層外觀；反之
`overlay.css` 也可能因選擇器不夠嚴謹而外溢到宿主頁面。這是穩健性/一致性問題，並非
安全漏洞。

**建議**：

- 若要符合文檔敘述，改用原生 `Element.attachShadow`（或重新引入 `react-shadow`）將浮層
  包進 Shadow Root，並把樣式改為注入 shadow root 內。
- 若維持現狀，請更新 README／商店文案，改描述為「以 Shadow DOM 隔離」→「以命名空間化
  的樣式隔離」，以免與實作不符。

---

## 4. 完整 `raw` API 回應被寫入 storage

**嚴重度：✅ 已於本 PR 修正**

原本 `src/background/services/UsageService.ts` 的 `buildClaudeUsage` 與 `buildCodexUsage`
會把**整包**原始 API 回應存進 `raw` 欄位，最終隨 `UsageState` 寫入
`chrome.storage.local`；但 UI 從未使用 `raw`（浮層與卡片只讀 `session` /
`weekly` / `lastUpdated`），形成不必要的靜態資料落地。

**修正**：

- 從 `buildClaudeUsage` / `buildCodexUsage` 的回傳物件移除 `raw`（抓取解析後即捨棄）。
- 從 `src/shared/types/index.ts` 的 `ClaudeUsage` / `CodexUsage` 介面移除 `raw?` 欄位。

如此寫入 storage 的快照只保留 UI 實際需要的欄位，降低儲存量與資料落地面。
（Codex 存取權杖本就不在 `raw`、也不在 storage，見發現 #7。）

---

## 5. `react-shadow` 為未使用的相依套件

**嚴重度：✅ 於本 PR 修正**

原本 `package.json` 的 `dependencies` 列有 `react-shadow`，但 `src/` 內找不到任何匯入
（僅出現在 `package.json` 與 `pnpm-lock.yaml`）。

**修正**：以 `pnpm remove react-shadow` 移除此未使用相依，並同步更新 `pnpm-lock.yaml`，
縮減安裝體積與供應鏈面。日後若要導入真正的 Shadow DOM（見發現 #3），可改用原生
`Element.attachShadow` 或重新引入所需套件。

---

## 6. `pnpm test` 指令在新版 Node 下無法掃描目錄

**嚴重度：✅ 已於本 PR 修正**

原本 `package.json` 的 test script 為 `node --test tests/`。在 Node v22 下，此寫法會以
`Cannot find module '.../tests'` 失敗；Node 20 則正常。

**修正**：已改為明確的檔案模式，跨 Node 版本皆可穩定運作：

```json
"test": "node --test tests/*.test.js"
```

**附帶效益**：本 PR 也為 CI 加上 `pull_request` 觸發（`.github/workflows/ci.yml`），
使 lint / format / test / build 在 PR 階段就會執行，而非只在合併進 `main` 之後。

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
