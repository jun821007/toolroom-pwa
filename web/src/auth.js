/**
 * 登入狀態（Supabase Auth）。
 *
 * 這裡用的是「公開金鑰」（publishable / anon），本來就設計成可以放在前端，
 * 它本身拿不到任何資料 —— 所有資料表都開了 RLS 而且沒寫任何政策，真正能讀寫
 * 的密鑰只存在 Railway 後端。公開金鑰在這裡唯一的用途就是登入。
 *
 * 之所以用 supabase-js 而不自己刻：access token 一小時就過期，要維持「登入一次
 * 記很久」必須靠 refresh token 自動輪替，這塊它已經處理好了。
 */
import { createClient } from "@supabase/supabase-js";

/**
 * 只留專案根網址。Dashboard 常給人複製成 …/rest/v1/，貼進這裡會變成
 * …/rest/v1/auth/v1/token → 立刻噴「Invalid path specified in request URL」。
 */
function normalizeProjectUrl(raw) {
  if (!raw) return "";
  try {
    const u = new URL(String(raw).trim());
    return `${u.protocol}//${u.host}`;
  } catch {
    return String(raw).trim().replace(/\/+$/, "").replace(/\/(rest|auth)\/v1.*$/i, "");
  }
}

const url = normalizeProjectUrl(import.meta.env.VITE_SUPABASE_URL);
const key = (import.meta.env.VITE_SUPABASE_ANON_KEY || "").trim();

export const authConfigured = Boolean(url && key);

export const supabase = authConfigured
  ? createClient(url, key, {
      auth: {
        persistSession: true,      // 存在 localStorage，關掉 App 也還在
        autoRefreshToken: true,    // 權杖快到期時自動換新，使用者無感
        detectSessionInUrl: false, // 我們沒有用 email 連結登入，不必解析網址
      },
    })
  : null;

/** 目前的存取權杖；給 api.js 掛在 Authorization 標頭上 */
export async function getAccessToken() {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

export async function signIn(email, password) {
  const { error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  });
  if (error) throw new Error(translate(error.message));
}

export async function signOut() {
  await supabase?.auth.signOut();
}

/** 自訂顯示名稱（寫進 Auth user_metadata.name，流水帳經手人會用這個） */
export async function updateDisplayName(name) {
  const clean = String(name || "").trim();
  if (!clean) throw new Error("請輸入顯示名稱");
  if (!supabase) throw new Error("登入尚未設定");

  const { data, error } = await supabase.auth.updateUser({
    data: { name: clean },
  });
  if (error) throw new Error(translate(error.message));
  return data.user;
}

/** Supabase 的錯誤訊息是英文，換成看得懂的話 */
function translate(msg = "") {
  if (/Invalid login credentials/i.test(msg)) return "帳號或密碼不對";
  if (/Email not confirmed/i.test(msg)) return "這個帳號還沒完成驗證，請到 Supabase 後台把它設為已確認";
  if (/Too many requests|rate limit/i.test(msg)) return "嘗試太多次了，請等幾分鐘再試";
  if (/Failed to fetch|NetworkError/i.test(msg)) return "連不上登入伺服器，請確認網路";
  if (/Invalid path specified/i.test(msg))
    return "VITE_SUPABASE_URL 貼錯了：只要 https://xxxx.supabase.co，不要加 /rest/v1";
  return msg;
}
