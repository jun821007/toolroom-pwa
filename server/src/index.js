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
let restUrl = null;      // 健康檢查要自己打 PostgREST 根路徑，所以留著
let authHeaders = null;

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

    // 新式金鑰（sb_secret_ / sb_publishable_）不是 JWT，放進 Bearer 會被判 Invalid JWT，
    // 只能走 apikey 標頭；舊式 service_role 是 JWT，兩個標頭都要給
    const isNewFormat = key.startsWith("sb_secret_") || key.startsWith("sb_publishable_");
    authHeaders = isNewFormat
      ? { apikey: key }
      : { apikey: key, Authorization: `Bearer ${key}` };

    restUrl = `${SUPABASE_URL.trim().replace(/\/$/, "")}/rest/v1`;
    db = new PostgrestClient(restUrl, { headers: authHeaders });
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

/* ------------------------------------------------------------------ */
/* 登入驗證                                                            */
/* ------------------------------------------------------------------ */

/**
 * 驗證前端帶上來的 Supabase 登入權杖。
 *
 * 這裡是直接問 Supabase Auth，而不是自己在本地驗簽章：專案日後改用非對稱
 * 金鑰也不必跟著改，也不用再多存一份 JWT secret。這支服務流量極低，多一次
 * 往返無感；驗過的權杖快取 60 秒，避免每個動作都打一次。
 */
const tokenCache = new Map();

async function verifyToken(token) {
  const hit = tokenCache.get(token);
  if (hit && hit.expires > Date.now()) return hit.user;

  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;

  const user = await res.json();
  if (!user?.id) return null;

  if (tokenCache.size > 100) tokenCache.clear(); // 權杖會輪替，別讓它無限長大
  tokenCache.set(token, { user, expires: Date.now() + 60_000 });
  return user;
}

async function requireAuth(req, res, next) {
  if (configError) return res.status(500).json({ error: configError });

  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return res.status(401).json({ error: "請先登入" });

  let user;
  try {
    user = await verifyToken(token);
  } catch (err) {
    return res.status(503).json({ error: `無法確認登入狀態：${err.message}` });
  }
  if (!user) return res.status(401).json({ error: "登入已失效，請重新登入" });

  req.user = user;
  // 流水帳的經手人一律取自登入身分，前端傳什麼都不算，才沒辦法冒名
  req.operator =
    user.user_metadata?.name?.trim() || user.email?.split("@")[0] || "未署名";
  next();
}

// /api/health 要能在還沒登入時就用來診斷設定，所以排除在驗證之外
app.use("/api", (req, res, next) =>
  req.path === "/health" ? next() : requireAuth(req, res, next)
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

/** 班級起始／調整庫存：允許設成 0，且要保留每一個有改到的品項 */
function cleanAbsoluteItems(raw) {
  if (!Array.isArray(raw)) throw new Error("品項格式錯誤");

  const out = [];
  const seen = new Set();
  for (const row of raw) {
    const id = Number(row?.item_id);
    const qty = Number(row?.qty);
    if (!Number.isInteger(id) || id <= 0) continue;
    if (!Number.isInteger(qty) || qty < 0) throw new Error("數量必須是 ≥ 0 的整數");
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ item_id: id, qty });
  }

  if (out.length === 0) throw new Error("請至少設定一項工具");
  return out;
}

/* ------------------------------------------------------------------ */
/* 讀取                                                                */
/* ------------------------------------------------------------------ */

app.get("/", (_req, res) => res.json({ ok: true, service: "toolroom-api" }));

/**
 * 健康檢查：直接用瀏覽器打開，一頁看完金鑰對不對、資料進去了沒。
 * 「查得到但都是空的」最常見的兩個原因是金鑰貼成公開金鑰、或 schema.sql 沒跑，
 * 從外面看症狀一模一樣，所以這裡把兩者分開報。
 */
app.get("/api/health", async (_req, res) => {
  if (configError) return res.json({ ok: true, supabase: "未設定", problem: configError });

  const out = { ok: true, supabase: "已設定" };

  // /rest/v1/ 是 OpenAPI 根路徑，只有密鑰打得開；公開金鑰一律 403
  try {
    const probe = await fetch(`${restUrl}/`, { headers: authHeaders });
    out.金鑰 = probe.ok
      ? "正確（密鑰／service_role，可繞過 RLS）"
      : `權限不足（HTTP ${probe.status}）— 你貼的應該是公開金鑰（anon／publishable），` +
        `請換成 Secret key（sb_secret_…）或 service_role key`;
  } catch (err) {
    out.金鑰 = `連不到 Supabase：${err.message}，請檢查 SUPABASE_URL`;
  }

  // 每張表幾筆，一眼看出 schema.sql 的 seed 有沒有真的寫進去
  try {
    const counts = {};
    for (const t of ["classes", "items", "class_stock", "logs", "class_notes", "todos"]) {
      const { count, error } = await db.from(t).select("*", { count: "exact", head: true });
      counts[t] = error ? `讀不到：${error.message}` : count;
    }
    out.資料筆數 = counts;
    out.預期 = { classes: 20, items: 22, class_stock: "0（還沒發放很正常）", logs: "0 以上" };
  } catch (err) {
    out.資料筆數 = `讀取失敗：${err.message}`;
  }

  res.json(out);
});

/** 一次抓齊班級、公庫品項、各班持有量 — 手機只打一次就能開畫面 */
app.get(
  "/api/bootstrap",
  handle(async (req, res) => {
    const [classes, items, stock] = await Promise.all([
      db.from("classes").select("id,name,sort").order("sort").then(unwrap),
      db.from("items").select("id,name,unit,qty,sort,active").eq("active", true).order("sort").order("name").then(unwrap),
      db.from("class_stock").select("class_id,item_id,qty").gt("qty", 0).then(unwrap),
    ]);
    // 一併回傳經手人，前端就不必自己解 JWT 也不必另外打一支 API
    res.json({ classes, items, stock, me: { name: req.operator, email: req.user.email } });
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

    // 新品項排到最後
    const existing = await db.from("items").select("sort").order("sort", { ascending: false }).limit(1).then(unwrap);
    const sort = (existing?.[0]?.sort ?? 0) + 1;

    const item = await db.from("items").insert({ name, unit, qty, sort }).select().single().then(unwrap);

    // 有填初始庫存就補一筆流水，帳才對得起來
    if (qty > 0) {
      await db
        .from("logs")
        .insert({ kind: "RESTOCK", item_id: item.id, qty, operator: req.operator, note: "新增品項初始庫存" })
        .then(unwrap);
    }

    res.json(item);
  })
);

/** 批次寫回顯示順序；body: { ordered_ids: [3,1,2,…] } */
app.put(
  "/api/items/reorder",
  handle(async (req, res) => {
    const ids = req.body?.ordered_ids;
    if (!Array.isArray(ids) || ids.length === 0) throw new Error("排序清單不能是空的");

    const clean = [...new Set(ids.map((n) => Number(n)).filter((n) => Number.isInteger(n) && n > 0))];
    if (clean.length === 0) throw new Error("排序清單格式錯誤");

    // 逐筆更新；品項少，一次交易用不到 RPC
    for (let i = 0; i < clean.length; i++) {
      await db
        .from("items")
        .update({ sort: i + 1 })
        .eq("id", clean[i])
        .then(unwrap);
    }

    res.json({ ok: true, count: clean.length });
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

/** 新增班級／地點（廁所等也算一筆） */
app.post(
  "/api/classes",
  handle(async (req, res) => {
    const name = String(req.body?.name || "").trim();
    if (!name) throw new Error("請輸入班級名稱");

    const existing = await db
      .from("classes")
      .select("sort")
      .order("sort", { ascending: false })
      .limit(1)
      .then(unwrap);
    const sort = (existing?.[0]?.sort ?? 0) + 1;

    const row = await db
      .from("classes")
      .insert({ name, sort })
      .select()
      .single()
      .then(unwrap);

    res.json(row);
  })
);

/** 班級顯示順序 */
app.put(
  "/api/classes/reorder",
  handle(async (req, res) => {
    const ids = req.body?.ordered_ids;
    if (!Array.isArray(ids) || ids.length === 0) throw new Error("排序清單不能是空的");
    const clean = [...new Set(ids.map((n) => Number(n)).filter((n) => Number.isInteger(n) && n > 0))];
    for (let i = 0; i < clean.length; i++) {
      await db.from("classes").update({ sort: (i + 1) * 10 }).eq("id", clean[i]).then(unwrap);
    }
    res.json({ ok: true, count: clean.length });
  })
);

/** 改班級名稱 */
app.put(
  "/api/classes/:id",
  handle(async (req, res) => {
    const name = String(req.body?.name || "").trim();
    if (!name) throw new Error("請輸入班級名稱");
    const row = await db
      .from("classes")
      .update({ name })
      .eq("id", Number(req.params.id))
      .select()
      .single()
      .then(unwrap);
    res.json(row);
  })
);

/** 刪班級（庫存／備註 cascade；流水帳保留，班級欄位變空） */
app.delete(
  "/api/classes/:id",
  handle(async (req, res) => {
    await db.from("classes").delete().eq("id", Number(req.params.id)).then(unwrap);
    res.json({ ok: true });
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
        p_operator: req.operator,
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
        p_operator: req.operator,
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
        p_operator: req.operator,
        p_note: req.body?.note || null,
      })
      .then(unwrap);

    res.json({ ok: true, count });
  })
);

/** 班級備註：最新在前 */
app.get(
  "/api/classes/:id/notes",
  handle(async (req, res) => {
    const classId = Number(req.params.id);
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const rows = await db
      .from("class_notes")
      .select("id,class_id,body,operator,created_at")
      .eq("class_id", classId)
      .order("created_at", { ascending: false })
      .limit(limit)
      .then(unwrap);
    res.json(rows);
  })
);

app.post(
  "/api/classes/:id/notes",
  handle(async (req, res) => {
    const classId = Number(req.params.id);
    const body = String(req.body?.body || "").trim();
    if (!body) throw new Error("請輸入文字");

    const found = await db.from("classes").select("id").eq("id", classId).limit(1).then(unwrap);
    if (!found?.length) throw new Error("班級不存在");

    const row = await db
      .from("class_notes")
      .insert({ class_id: classId, body, operator: req.operator })
      .select()
      .single()
      .then(unwrap);

    res.json(row);
  })
);

app.put(
  "/api/classes/:id/notes/:noteId",
  handle(async (req, res) => {
    const body = String(req.body?.body || "").trim();
    if (!body) throw new Error("請輸入文字");
    const row = await db
      .from("class_notes")
      .update({ body, operator: req.operator })
      .eq("id", Number(req.params.noteId))
      .eq("class_id", Number(req.params.id))
      .select()
      .single()
      .then(unwrap);
    res.json(row);
  })
);

app.delete(
  "/api/classes/:id/notes/:noteId",
  handle(async (req, res) => {
    await db
      .from("class_notes")
      .delete()
      .eq("id", Number(req.params.noteId))
      .eq("class_id", Number(req.params.id))
      .then(unwrap);
    res.json({ ok: true });
  })
);

/** 班級起始／調整貨量（絕對值，不扣公庫） */
app.post(
  "/api/classes/:id/stock",
  handle(async (req, res) => {
    const count = await db
      .rpc("set_class_stock", {
        p_class: Number(req.params.id),
        p_items: cleanAbsoluteItems(req.body?.items),
        p_operator: req.operator,
        p_note: req.body?.note || null,
      })
      .then(unwrap);

    res.json({ ok: true, count });
  })
);

/* ------------------------------------------------------------------ */
/* 待辦事項                                                            */
/* ------------------------------------------------------------------ */

app.get(
  "/api/todos",
  handle(async (_req, res) => {
    const rows = await db
      .from("todos")
      .select("id,body,done,pinned,sort,operator,created_at,updated_at")
      .order("done")
      .order("pinned", { ascending: false })
      .order("sort")
      .order("id")
      .then(unwrap);
    res.json(rows);
  })
);

app.post(
  "/api/todos",
  handle(async (req, res) => {
    const body = String(req.body?.body || "").trim();
    if (!body) throw new Error("請輸入待辦內容");

    const open = await db
      .from("todos")
      .select("sort")
      .eq("done", false)
      .order("sort", { ascending: false })
      .limit(1)
      .then(unwrap);
    const sort = (open?.[0]?.sort ?? 0) + 1;

    const row = await db
      .from("todos")
      .insert({
        body,
        done: false,
        pinned: Boolean(req.body?.pinned),
        sort,
        operator: req.operator,
        updated_at: new Date().toISOString(),
      })
      .select()
      .single()
      .then(unwrap);

    res.json(row);
  })
);

app.put(
  "/api/todos/reorder",
  handle(async (req, res) => {
    const ids = req.body?.ordered_ids;
    if (!Array.isArray(ids) || ids.length === 0) throw new Error("排序清單不能是空的");
    const clean = [...new Set(ids.map((n) => Number(n)).filter((n) => Number.isInteger(n) && n > 0))];
    for (let i = 0; i < clean.length; i++) {
      await db
        .from("todos")
        .update({ sort: i + 1, updated_at: new Date().toISOString() })
        .eq("id", clean[i])
        .then(unwrap);
    }
    res.json({ ok: true, count: clean.length });
  })
);

app.put(
  "/api/todos/:id",
  handle(async (req, res) => {
    const id = Number(req.params.id);
    const patch = { updated_at: new Date().toISOString() };

    if (req.body?.body !== undefined) {
      const body = String(req.body.body || "").trim();
      if (!body) throw new Error("請輸入待辦內容");
      patch.body = body;
    }
    if (req.body?.done !== undefined) patch.done = Boolean(req.body.done);
    if (req.body?.pinned !== undefined) patch.pinned = Boolean(req.body.pinned);

    // 勾完成／取消完成時，排到該組末尾
    if (req.body?.done !== undefined) {
      const group = await db
        .from("todos")
        .select("sort")
        .eq("done", Boolean(req.body.done))
        .order("sort", { ascending: false })
        .limit(1)
        .then(unwrap);
      patch.sort = (group?.[0]?.sort ?? 0) + 1;
      if (req.body.done) patch.pinned = false; // 完成的不置頂
    }

    const row = await db.from("todos").update(patch).eq("id", id).select().single().then(unwrap);
    res.json(row);
  })
);

app.delete(
  "/api/todos/:id",
  handle(async (req, res) => {
    await db.from("todos").delete().eq("id", Number(req.params.id)).then(unwrap);
    res.json({ ok: true });
  })
);

// Railway 要求綁 0.0.0.0，否則邊緣節點轉不進來
app.listen(Number(PORT), "0.0.0.0", () =>
  console.log(`toolroom-api listening on 0.0.0.0:${PORT}`)
);
