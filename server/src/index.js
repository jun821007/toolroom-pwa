/**
 * 衛生組工具室庫存 API
 * 部署於 Railway，用 service_role key 連 Supabase（資料表都開了 RLS 且沒有政策，
 * 所以只有這支後端碰得到資料，前端永遠拿不到金鑰）。
 */
import express from "express";
import cors from "cors";
import { PostgrestClient } from "@supabase/postgrest-js";

const { SUPABASE_URL, SUPABASE_SERVICE_KEY, ALLOWED_ORIGIN, PORT = 8080 } = process.env;

/**
 * 設定不完整時「不要」讓程序結束。
 * 一結束 Railway 只會顯示 Application failed to respond，
 * 真正的原因被埋在 log 裡；照樣啟動才能把問題直接回給瀏覽器看。
 */
let db = null;
let configError = null;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  const missing = [
    !SUPABASE_URL && "SUPABASE_URL",
    !SUPABASE_SERVICE_KEY && "SUPABASE_SERVICE_KEY",
  ].filter(Boolean);
  configError = `Railway 缺少環境變數：${missing.join("、")}。請到 Railway → Variables 補上後重新部署。`;
} else {
  try {
    // 只用 PostgREST，不碰 supabase-js 的 Realtime／Auth／Storage：
    // 那些會要求 Node 22+ 的原生 WebSocket，這支 API 完全用不到。
    const key = SUPABASE_SERVICE_KEY.trim();

    // 新式金鑰（sb_secret_ / sb_publishable_）不是 JWT，只能放 apikey，不可當 Bearer
    const isNewFormat = key.startsWith("sb_secret_") || key.startsWith("sb_publishable_");
    const headers = isNewFormat
      ? { apikey: key }
      : { apikey: key, Authorization: `Bearer ${key}` };

    db = new PostgrestClient(`${SUPABASE_URL.trim().replace(/\/$/, "")}/rest/v1`, { headers });
  } catch (err) {
    configError = `Supabase 設定有誤：${err.message}。請檢查 SUPABASE_URL 與 SUPABASE_SERVICE_KEY 是否貼錯。`;
  }
}

if (configError) console.error(configError);

const app = express();
app.use(express.json({ limit: "256kb" }));
app.use(
  cors({
    origin: ALLOWED_ORIGIN ? ALLOWED_ORIGIN.split(",").map((s) => s.trim()) : true,
  })
);

/** 把 async handler 的例外統一轉成 JSON 錯誤回應 */
const handle = (fn) => async (req, res) => {
  try {
    if (configError) throw new Error(configError);
    await fn(req, res);
  } catch (err) {
    let message = err?.message || "伺服器發生錯誤";
    // fetch failed 是連不到 Supabase，直接講人話比較好查
    if (message.includes("fetch failed")) message = "連不上 Supabase，請檢查 SUPABASE_URL 與網路";
    console.error(err);
    res.status(400).json({ error: message });
  }
};

/** PostgREST 回傳的 { data, error }：有 error 就丟出來讓 handle 接住 */
const unwrap = ({ data, error }) => {
  if (error) {
    // PL/pgSQL 的 RAISE EXCEPTION 訊息會落在 message，已經是中文人話
    throw new Error(error.message || error.hint || error.details || "資料庫作業失敗");
  }
  return data;
};

/** 前端送來的品項清單可能有空列或重複，這裡先清乾淨再交給資料庫 */
function cleanItems(raw) {
  if (!Array.isArray(raw)) throw new Error("品項格式錯誤");

  const merged = new Map();
  for (const row of raw) {
    const id = Number(row?.item_id);
    const qty = Number(row?.qty);
    if (!Number.isInteger(id) || id <= 0) continue;
    if (!Number.isInteger(qty) || qty <= 0) throw new Error("數量必須是大於 0 的整數");
    merged.set(id, (merged.get(id) || 0) + qty);
  }

  if (merged.size === 0) throw new Error("請至少選擇一項工具");
  return [...merged].map(([item_id, qty]) => ({ item_id, qty }));
}

/* ------------------------------------------------------------------ */
/* 讀取                                                                */
/* ------------------------------------------------------------------ */

app.get("/", (_req, res) => res.json({ ok: true, service: "toolroom-api" }));

/** 健康檢查順便回報設定狀態，直接用瀏覽器打開就能看出缺什麼 */
app.get("/api/health", (_req, res) =>
  res.json({
    ok: true,
    supabase: configError ? "未設定" : "已設定",
    problem: configError ?? undefined,
  })
);

/** 一次抓齊班級、公庫品項、各班持有量 — 手機只打一次就能開畫面 */
app.get(
  "/api/bootstrap",
  handle(async (_req, res) => {
    const [classes, items, stock] = await Promise.all([
      db.from("classes").select("id,name,sort").order("sort").then(unwrap),
      db.from("items").select("id,name,unit,qty,active").eq("active", true).order("name").then(unwrap),
      db.from("class_stock").select("class_id,item_id,qty").gt("qty", 0).then(unwrap),
    ]);
    res.json({ classes, items, stock });
  })
);

/** 流水帳；支援 class / item / kind 篩選 */
app.get(
  "/api/logs",
  handle(async (req, res) => {
    const { class_id, item_id, kind, limit = 200 } = req.query;

    let q = db
      .from("logs")
      .select("id,kind,from_class,to_class,item_id,qty,operator,note,created_at")
      .order("created_at", { ascending: false })
      .limit(Math.min(Number(limit) || 200, 500));

    if (class_id) q = q.or(`from_class.eq.${Number(class_id)},to_class.eq.${Number(class_id)}`);
    if (item_id) q = q.eq("item_id", Number(item_id));
    if (kind) q = q.eq("kind", kind);

    res.json(await q.then(unwrap));
  })
);

/* ------------------------------------------------------------------ */
/* 品項維護                                                            */
/* ------------------------------------------------------------------ */

app.post(
  "/api/items",
  handle(async (req, res) => {
    const name = String(req.body?.name || "").trim();
    const unit = String(req.body?.unit || "個").trim() || "個";
    const qty = Math.max(0, Math.trunc(Number(req.body?.qty) || 0));
    if (!name) throw new Error("請輸入品項名稱");

    const item = await db.from("items").insert({ name, unit, qty }).select().single().then(unwrap);

    // 有填初始庫存就補一筆流水，帳才對得起來
    if (qty > 0) {
      await db
        .from("logs")
        .insert({ kind: "RESTOCK", item_id: item.id, qty, operator: "建檔", note: "新增品項初始庫存" })
        .then(unwrap);
    }

    res.json(item);
  })
);

app.put(
  "/api/items/:id",
  handle(async (req, res) => {
    const name = String(req.body?.name || "").trim();
    const unit = String(req.body?.unit || "個").trim() || "個";
    if (!name) throw new Error("請輸入品項名稱");

    const item = await db
      .from("items")
      .update({ name, unit })
      .eq("id", Number(req.params.id))
      .select()
      .single()
      .then(unwrap);

    res.json(item);
  })
);

/** 停用品項：保留歷史流水，只是不再出現在清單 */
app.delete(
  "/api/items/:id",
  handle(async (req, res) => {
    await db.from("items").update({ active: false }).eq("id", Number(req.params.id)).then(unwrap);
    res.json({ ok: true });
  })
);

/* ------------------------------------------------------------------ */
/* 庫存異動（都走 Postgres RPC，確保單一 Transaction）                   */
/* ------------------------------------------------------------------ */

app.post(
  "/api/items/:id/restock",
  handle(async (req, res) => {
    const qty = Math.trunc(Number(req.body?.qty));
    if (!Number.isInteger(qty) || qty <= 0) throw new Error("補貨數量必須大於 0");

    const after = await db
      .rpc("restock", {
        p_item: Number(req.params.id),
        p_qty: qty,
        p_operator: req.body?.operator || "未署名",
        p_note: req.body?.note || null,
      })
      .then(unwrap);

    res.json({ ok: true, qty: after });
  })
);

app.post(
  "/api/distribute",
  handle(async (req, res) => {
    const count = await db
      .rpc("distribute", {
        p_to: Number(req.body?.to_class_id),
        p_items: cleanItems(req.body?.items),
        p_operator: req.body?.operator || "未署名",
        p_note: req.body?.note || null,
      })
      .then(unwrap);

    res.json({ ok: true, count });
  })
);

app.post(
  "/api/transfer",
  handle(async (req, res) => {
    const count = await db
      .rpc("transfer", {
        p_from: Number(req.body?.from_class_id),
        p_to: Number(req.body?.to_class_id),
        p_items: cleanItems(req.body?.items),
        p_operator: req.body?.operator || "未署名",
        p_note: req.body?.note || null,
      })
      .then(unwrap);

    res.json({ ok: true, count });
  })
);

// Railway 要求綁 0.0.0.0，否則邊緣節點轉不進來
app.listen(Number(PORT), "0.0.0.0", () =>
  console.log(`toolroom-api listening on 0.0.0.0:${PORT}`)
);
