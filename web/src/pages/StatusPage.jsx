import { useEffect, useState } from "react";
import { api } from "../api";
import { LAST_CLASS_KEY } from "../constants";

const fmt = (iso) =>
  new Date(iso).toLocaleString("zh-TW", {
    timeZone: "Asia/Taipei",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

/**
 * 各班備註總覽（新→舊）；點一筆跳到該班級頁。
 * onOpenClass(classId) 由 App 切到「班級」分頁。
 */
export default function StatusPage({ toast, onOpenClass }) {
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .allNotes({ limit: 150 })
      .then((data) => {
        if (!cancelled) setNotes(data);
      })
      .catch((err) => toast?.({ ok: false, msg: err.message }))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [toast]);

  const openClass = (classId) => {
    if (!classId) {
      toast?.({ ok: false, msg: "這個班級已刪除，無法開啟" });
      return;
    }
    localStorage.setItem(LAST_CLASS_KEY, String(classId));
    onOpenClass?.(classId);
  };

  if (loading) {
    return <p className="py-16 text-center text-sm font-bold text-slate-400">載入中…</p>;
  }

  if (notes.length === 0) {
    return (
      <div className="space-y-3">
        <h2 className="text-base font-extrabold text-slate-800">各班備註狀態</h2>
        <p className="rounded-2xl bg-white/70 py-16 text-center text-sm font-bold text-slate-400">
          還沒有任何班級備註
          <br />
          <span className="text-xs">到「班級」頁寫備註後會出現在這裡</span>
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3 pb-4">
      <div>
        <h2 className="text-base font-extrabold text-slate-800">各班備註狀態</h2>
        <p className="text-xs font-bold text-slate-400">每班只顯示最新備註｜點一筆可跳到該班</p>
      </div>

      <div className="space-y-2">
        {notes.map((n) => (
          <button
            key={n.id}
            type="button"
            onClick={() => openClass(n.class_id)}
            className="card flex w-full overflow-hidden text-left active:scale-[0.99]"
          >
            <span className="w-1.5 shrink-0 bg-sky2-400" />
            <div className="min-w-0 flex-1 px-4 py-3">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-extrabold text-slate-800">{n.class_name}</span>
                <span className="shrink-0 text-xs font-bold text-slate-400">{fmt(n.created_at)}</span>
              </div>
              <p className="mt-1.5 line-clamp-3 whitespace-pre-wrap text-sm font-bold text-slate-600">
                {n.body}
              </p>
              <p className="mt-1 text-[11px] font-bold text-slate-400">
                經手人：{n.operator}
                <span className="ml-2 text-sky2-600">開啟班級 →</span>
              </p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
