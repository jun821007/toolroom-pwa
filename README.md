# 衛生組工具室庫存（手機版 PWA）

加到 iPhone 主畫面後全螢幕運作，沒有網址列、沒有 Safari 底部列，用起來就像原生 App。

```
toolroom-pwa/
├── supabase/schema.sql   ← 貼到 Supabase SQL Editor 跑一次
├── server/               ← Railway（Express API，持有 service_role key）
└── web/                  ← Netlify（React + Vite PWA）
```

**架構**：手機 → Netlify 前端 → Railway API → Supabase。
前端永遠拿不到資料庫金鑰；批量發放與跨班調貨都在 Postgres 函式裡跑單一 Transaction，
任一品項不足就整筆取消。

---

## 步驟 1：Supabase

1. <https://supabase.com/dashboard> → **New project**，Region 選 **Northeast Asia (Tokyo)**。
2. 左側 **SQL Editor → New query**，貼上 `supabase/schema.sql` 全文 → **Run**。
   - 建 4 張表（`items` / `classes` / `class_stock` / `logs`）與 3 支 RPC
   - 寫入 20 個班級、22 項工具室現有庫存
3. **Project Settings → API**，抄下兩個東西：
   - `Project URL`
   - `service_role` key（⚠️ 只給 Railway 用，絕不放前端）

## 步驟 2：推上 GitHub

```powershell
cd C:\Users\rsz97\toolroom-pwa
git remote add origin https://github.com/<你的帳號>/toolroom-pwa.git
git branch -M main
git push -u origin main
```

## 步驟 3：Railway 後端

1. <https://railway.app> → **New Project → Deploy from GitHub repo** → 選這個 repo。
2. **Settings → Root Directory** 填 `server`。
3. **Variables** 加入：

   | 變數 | 值 |
   |------|-----|
   | `SUPABASE_URL` | 步驟 1 的 Project URL |
   | `SUPABASE_SERVICE_KEY` | 步驟 1 的 service_role key |
   | `ALLOWED_ORIGIN` | 步驟 4 拿到 Netlify 網址後再回來填 |

4. **Settings → Networking → Generate Domain**，會得到像
   `https://toolroom-api-production.up.railway.app` 的網址。
5. 開 `你的網址/api/health`，看到 `{"ok":true}` 就成功了。

## 步驟 4：Netlify 前端

1. <https://app.netlify.com> → **Add new site → Import an existing project** → 選同一個 repo。
2. Build 設定會自動讀 `web/netlify.toml`（base `web`、publish `dist`），不用手動改。
3. **Site configuration → Environment variables** 加入：

   | 變數 | 值 |
   |------|-----|
   | `VITE_API_BASE` | 步驟 3 的 Railway 網址（**結尾不要斜線**） |

4. 重新 Deploy 一次讓環境變數生效。
5. 回 Railway 把 `ALLOWED_ORIGIN` 填成 Netlify 網址（例如 `https://xxx.netlify.app`），會自動重啟。

## 步驟 5：加到 iPhone 主畫面

1. iPhone Safari 開啟 Netlify 網址。
2. 點下方**分享**按鈕 → **加入主畫面** → **新增**。
3. 從主畫面圖示開啟 → 全螢幕，沒有網址列。

> 只有 Safari 支援「加入主畫面」，Chrome 不行。
> 之後改版，關掉 App 再重開就會自動更新。

---

## 本機開發（PowerShell）

後端：

```powershell
cd C:\Users\rsz97\toolroom-pwa\server
Copy-Item .env.example .env
# 編輯 .env 填入 SUPABASE_URL 與 SUPABASE_SERVICE_KEY
node --env-file=.env src/index.js
```

前端（另開一個終端機）：

```powershell
cd C:\Users\rsz97\toolroom-pwa\web
Copy-Item .env.example .env.local
# 把 VITE_API_BASE 改成 http://127.0.0.1:8080
npm run dev -- --host 127.0.0.1
```

---

## API

| Method | 路徑 | 說明 |
|--------|------|------|
| GET | `/api/health` | 健康檢查（Railway 用） |
| GET | `/api/bootstrap` | 一次回傳班級 + 公庫品項 + 各班持有量 |
| GET | `/api/logs?kind=&class_id=&item_id=` | 流水帳 |
| POST | `/api/items` | 新增品項 `{ name, unit, qty }` |
| PUT | `/api/items/:id` | 改名稱／單位 |
| DELETE | `/api/items/:id` | 停用品項（保留歷史流水） |
| POST | `/api/items/:id/restock` | 補貨 `{ qty, operator, note }` |
| POST | `/api/distribute` | 公庫發放 `{ to_class_id, items:[{item_id,qty}], operator, note }` |
| POST | `/api/transfer` | 跨班調貨 `{ from_class_id, to_class_id, items, operator, note }` |

## 畫面

底部四個分頁，全部單手可操作：

| 分頁 | 功能 |
|------|------|
| 🧰 公庫 | 品項清單、一鍵補貨、新增／改名／停用品項 |
| 🚚 發放 | 選班級 → 多選工具與數量 → 一鍵發出，扣公庫 |
| 🔄 調貨 | 選來源班 → 目標班 → 只列出來源班真的有的東西 → 扣 A 補 B |
| 🧾 流水 | 時間、來源 ➔ 去向、品項、數量、經手人，可依類型與班級篩選 |

經手人第一次開啟時輸入，存在手機 `localStorage`，之後不再詢問。

## 配色

薄荷綠 `mint`（庫存／確認）、天空藍 `sky2`（發放／操作）、活力橘 `zest`（調撥／警示）。
