import { useEffect, useMemo, useState } from "react";
import ClassPicker from "../components/ClassPicker";
import { api } from "../api";

const LAST_CLASS_KEY = "toolroom_last_class";

const KINDS = {
  RESTOCK: { label: "進貨", chip: "bg-mint-100 text-mint-700" },
  DISTRIBUTE: { label: "發放", chip: "bg-sky2-100 text-sky2-700" },
  TRANSFER: { label: "調貨", chip: "bg-zest-100 text-zest-700" },
};

const fmt = (iso) =>
  new Date(iso).toLocaleString("zh-TW", {
    timeZone: "Asia/Taipei",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

/** 查各班目前持有量 + 該班異動明細 */
export default function ClassStockPage({ classes, items, stock, toast }) {
  const [classId, setClassId] = useState(() => {
    const saved = Number(localStorage.getItem(LAST_CLASS_KEY));
    return Number.isInteger(saved) && saved > 0 ? saved : null;
  });
  const [picking, setPicking] = useState(() => {
    const saved = Number(localStorage.getItem(LAST_CLASS_KEY));
    return !(Number.isInteger(saved) && saved > 0);
  });
  const [keyword, setKeyword] = useState("");
  const [logs, setLogs] = useState([]);
  const [logsLoading, setLogsLoading] = useState(false);

  const itemById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const className = useMemo(() => {
    const map = new Map(classes.map((c) => [c.id, c.name]));
    return (id) => (id == null ? "公庫" : (map.get(id) ?? "—"));
  }, [classes]);

  const pickClass = (id) => {
    setClassId(id);
    setKeyword("");
    if (id) {
      localStorage.setItem(LAST_CLASS_KEY, String(id));
      setPicking(false);
    } else {
      localStorage.removeItem(LAST_CLASS_KEY);
    }
  };

  const rows = useMemo(() => {
    if (!classId) return [];
    return stock
      .filter((s) => s.class_id === classId && s.qty > 0)
      .map((s) => {
        const item = itemById.get(s.item_id);
        return item ? { id: item.id, name: item.name, unit: item.unit, qty: s.qty } : null;
      })
      .filter(Boolean)
      .sort((a, b) => a.name.localeCompare(b.name, "zh-Hant"));
  }, [classId, stock, itemById]);

  // 選班後抓該班流水，當異動明細
  useEffect(() => {
    if (!classId) {
      setLogs([]);
      return;
    }
    let cancelled = false;
    setLogsLoading(true);
    api
      .logs({ class_id: classId, limit: 100 })
      .then((data) => {
        if (!cancelled) setLogs(data);
      })
      .catch((err) => {
        if (!cancelled) toast?.({ ok: false, msg: err.message });
      })
      .finally(() => {
        if (!cancelled) setLogsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [classId, toast]);

  const kw = keyword.trim();
  const visible = kw ? rows.filter((r) => r.name.includes(kw)) : rows;
  const totalQty = rows.reduce((s, r) => s + r.qty, 0);
  const selected = classes.find((c) => c.id === classId);

  // 還沒選班，或按了「換班」：只顯示班級按鈕
  if (!classId || picking) {
    return (
      <div className="space-y-4 pb-4">
        <section>
          <h2 className="mb-2 text-sm font-extrabold text-slate-500">選班級看庫存與明細</h2>
          <ClassPicker classes={classes} value={classId} onChange={pickClass} tone="sky" />
        </section>
        {!classId ? (
          <p className="py-12 text-center text-sm font-bold text-slate-400">點一個班級開始</p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-4">
      {/* 已選班：收成一列，把空間留給明細 */}
      <div className="card flex items-center justify-between gap-3 px-4 py-3">
        <div className="min-w-0">
          <p className="text-xs font-bold text-slate-400">目前查看</p>
          <p className="truncate text-lg font-extrabold text-slate-800">{selected?.name}</p>
        </div>
        <button
          type="button"
          onClick={() => setPicking(true)}
          className="shrink-0 rounded-xl bg-sky2-500 px-3 py-2.5 text-sm font-extrabold text-white active:scale-95"
        >
          換班
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="card px-4 py-3">
          <p className="text-xs font-bold text-slate-400">品項</p>
          <p className="text-2xl font-extrabold text-sky2-600">{rows.length}</p>
        </div>
        <div className="card px-4 py-3">
          <p className="text-xs font-bold text-slate-400">總件數</p>
          <p className="text-2xl font-extrabold text-mint-600">{totalQty.toLocaleString("zh-TW")}</p>
        </div>
      </div>

      {/* —— 現有庫存 —— */}
      <section className="space-y-2">
        <h2 className="text-sm font-extrabold text-slate-500">現有庫存</h2>

        {rows.length > 0 ? (
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="搜尋工具…"
            className="field"
          />
        ) : null}

        {visible.map((row) => (
          <div key={row.id} className="card flex items-center justify-between gap-3 px-4 py-3">
            <span className="min-w-0 truncate text-base font-bold text-slate-800">{row.name}</span>
            <span className="shrink-0 text-2xl font-extrabold tabular-nums text-slate-700">
              {row.qty}
              <span className="ml-0.5 text-xs font-bold text-slate-400">{row.unit}</span>
            </span>
          </div>
        ))}

        {rows.length === 0 ? (
          <p className="rounded-2xl bg-white/60 py-10 text-center text-sm font-bold text-slate-400">
            這班目前沒有工具
            <br />
            <span className="text-xs">到「發放」從公庫發過去</span>
          </p>
        ) : null}

        {rows.length > 0 && visible.length === 0 ? (
          <p className="py-8 text-center text-sm font-bold text-slate-400">找不到符合的工具</p>
        ) : null}
      </section>

      {/* —— 異動明細 —— */}
      <section className="space-y-2">
        <h2 className="text-sm font-extrabold text-slate-500">異動明細</h2>

        {logsLoading ? (
          <p className="py-8 text-center text-sm font-bold text-slate-400">載入中…</p>
        ) : logs.length === 0 ? (
          <p className="rounded-2xl bg-white/60 py-10 text-center text-sm font-bold text-slate-400">
            還沒有異動紀錄
          </p>
        ) : (
          logs.map((log) => {
            const meta = KINDS[log.kind] || { label: log.kind, chip: "bg-slate-100 text-slate-600" };
            const item = itemById.get(log.item_id) || { name: "（已停用品項）", unit: "" };
            const intoThis = log.to_class === classId;
            const outOfThis = log.from_class === classId;

            let direction;
            if (log.kind === "DISTRIBUTE" && intoThis) {
              direction = `公庫 ➔ ${selected?.name}`;
            } else if (outOfThis && intoThis) {
              direction = `${className(log.from_class)} ➔ ${className(log.to_class)}`;
            } else if (outOfThis) {
              direction = `${selected?.name} ➔ ${className(log.to_class)}`;
            } else {
              direction = `${className(log.from_class)} ➔ ${selected?.name}`;
            }

            return (
              <div key={log.id} className="card px-4 py-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="mb-1 flex flex-wrap items-center gap-1.5">
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-extrabold ${meta.chip}`}>
                        {meta.label}
                      </span>
                      <span className="text-[11px] font-bold text-slate-400">{fmt(log.created_at)}</span>
                    </div>
                    <p className="truncate text-base font-bold text-slate-800">{item.name}</p>
                    <p className="mt-0.5 text-xs font-bold text-slate-400">{direction}</p>
                    {log.note ? (
                      <p className="mt-1 text-xs font-bold text-slate-400">備註：{log.note}</p>
                    ) : null}
                    <p className="mt-0.5 text-xs font-bold text-slate-400">經手人：{log.operator}</p>
                  </div>
                  <span
                    className={`shrink-0 text-xl font-extrabold tabular-nums ${
                      intoThis && !outOfThis ? "text-mint-600" : outOfThis && !intoThis ? "text-zest-600" : "text-slate-700"
                    }`}
                  >
                    {intoThis && !outOfThis ? "+" : outOfThis && !intoThis ? "−" : ""}
                    {log.qty}
                    <span className="ml-0.5 text-xs font-bold text-slate-400">{item.unit}</span>
                  </span>
                </div>
              </div>
            );
          })
        )}
      </section>
    </div>
  );
}
