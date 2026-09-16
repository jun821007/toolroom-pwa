/**
 * 後端 API 呼叫。
 * VITE_API_BASE 在 Netlify 設成 Railway 的網址，例如 https://xxx.up.railway.app
 */
const BASE = (import.meta.env.VITE_API_BASE || "").replace(/\/$/, "");

async function request(path, options = {}) {
  let res;
  try {
    res = await fetch(`${BASE}${path}`, {
      headers: { "Content-Type": "application/json" },
      ...options,
    });
  } catch {
    throw new Error("連不上伺服器，請確認網路或 VITE_API_BASE 設定");
  }

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;

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
  restock: (id, body) =>
    request(`/api/items/${id}/restock`, { method: "POST", body: JSON.stringify(body) }),

  distribute: (body) => request("/api/distribute", { method: "POST", body: JSON.stringify(body) }),
  transfer: (body) => request("/api/transfer", { method: "POST", body: JSON.stringify(body) }),
};
