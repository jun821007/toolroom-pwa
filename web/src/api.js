/**
 * 後端 API 呼叫。
 * VITE_API_BASE 在 Netlify 設成 Railway 的網址，例如 https://xxx.up.railway.app
 */
import { getAccessToken, signOut } from "./auth";

const BASE = (import.meta.env.VITE_API_BASE || "").replace(/\/$/, "");

/** 登入失效時通知 App 跳回登入畫面 */
export class AuthExpiredError extends Error {}

async function request(path, options = {}) {
  const token = await getAccessToken();

  let res;
  try {
    res = await fetch(`${BASE}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    });
  } catch {
    throw new Error("連不上伺服器，請確認網路或 VITE_API_BASE 設定");
  }

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;

  // 權杖失效就地登出，App 會收到狀態變化自動回到登入頁，各頁面不必各自處理
  if (res.status === 401) {
    await signOut();
    throw new AuthExpiredError(data?.error || "請重新登入");
  }
  if (!res.ok) throw new Error(data?.error || `伺服器錯誤（${res.status}）`);
  return data;
}

export const api = {
  bootstrap: () => request("/api/bootstrap"),

  logs: (filters = {}) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(filters)) if (v) q.set(k, v);
    return request(`/api/logs?${q}`);
  },

  createItem: (body) => request("/api/items", { method: "POST", body: JSON.stringify(body) }),
  updateItem: (id, body) => request(`/api/items/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  deleteItem: (id) => request(`/api/items/${id}`, { method: "DELETE" }),
  reorderItems: (ordered_ids) =>
    request("/api/items/reorder", { method: "PUT", body: JSON.stringify({ ordered_ids }) }),
  restock: (id, body) =>
    request(`/api/items/${id}/restock`, { method: "POST", body: JSON.stringify(body) }),

  createClass: (body) => request("/api/classes", { method: "POST", body: JSON.stringify(body) }),

  classNotes: (classId) => request(`/api/classes/${classId}/notes`),
  addClassNote: (classId, body) =>
    request(`/api/classes/${classId}/notes`, { method: "POST", body: JSON.stringify(body) }),
  setClassStock: (classId, body) =>
    request(`/api/classes/${classId}/stock`, { method: "POST", body: JSON.stringify(body) }),

  distribute: (body) => request("/api/distribute", { method: "POST", body: JSON.stringify(body) }),
  transfer: (body) => request("/api/transfer", { method: "POST", body: JSON.stringify(body) }),
};
