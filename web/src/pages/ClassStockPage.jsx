import { useEffect, useMemo, useState } from "react";
import ClassPicker from "../components/ClassPicker";
import AddClassSheet from "../components/AddClassSheet";
import Sheet from "../components/Sheet";
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

/** 查各班庫存：清單風格對齊公庫，點品項可看明細 */
export default function ClassStockPage({ classes, items, stock, reload, toast }) {
  const [classId, setClassId] = useState(() => {
    const saved = Number(localStorage.getItem(LAST_CLASS_KEY));
    return Number.isInteger(saved) && saved > 0 ? saved : null;
  });
  const [picking, setPicking] = useState(() => {
    const saved = Number(localStorage.getItem(LAST_CLASS_KEY));
    return !(Number.isInteger(saved) && saved > 0);
  });
  const [keyword, setKeyword] = useState("");
  const [detail, setDetail] = useState(null); // { id, name, unit, qty }
  const [adding, setAdding] = useState(false);

  const itemById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);

  const pickClass = (id) => {
    setClassId(id);
    setKeyword("");
    setDetail(null);
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
        return item
          ? { id: item.id, name: item.name, unit: item.unit, qty: s.qty, sort: item.sort ?? 0 }
          : null;
      })
      .filter(Boolean)
      .sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name, "zh-Hant"));
  }, [classId, stock, itemById]);

  const kw = keyword.trim();
  const visible = kw ? rows.filter((r) => r.name.includes(kw)) : rows;
  const totalQty = rows.reduce((s, r) => s + r.qty, 0);
  const selected = classes.find((c) => c.id === classId);

  if (!classId || picking) {
    return (
      <div className="space-y-4 pb-4">
        <section>
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className="text-sm font-extrabold text-slate-500">選班級看庫存</h2>
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="rounded-xl bg-sky2-500 px-3 py-1.5 text-xs font-extrabold text-white active:scale-95"
            >
              ＋新增班級
            </button>
          </div>
          <ClassPicker classes={classes} value={classId} onChange={pickClass} tone="sky" />
        </section>
        {!classId ? (
          <p className="py-12 text-center text-sm font-bold text-slate-400">點一個班級開始</p>
        ) : null}

        <AddClassSheet
          open={adding}
          onClose={() => setAdding(false)}
          onCreated={async (row) => {
            await reload();
            pickClass(row.id);
          }}
          toast={toast}
        />
      </div>
    );
  }

  return (
    <div className="space-y-3 pb-4">
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

      {rows.length > 0 ? (
        <input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="搜尋工具…"
          className="field"
        />
      ) : null}

      {/* 清單排版對齊公庫：左名稱、右數量，點一下開明細 */}
      <div className="space-y-2">
        {visible.map((row) => (
          <button
            key={row.id}
            type="button"
            onClick={() => setDetail(row)}
            className="card flex w-full items-center gap-3 px-4 py-3 text-left active:scale-[0.99]"
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate text-base font-bold text-slate-800">{row.name}</span>
              <span className="text-xs font-bold text-slate-400">點一下看明細</span>
            </span>
            <span className="shrink-0 text-2xl font-extrabold tabular-nums text-slate-700">
              {row.qty}
              <span className="ml-0.5 text-xs font-bold text-slate-400">{row.unit}</span>
            </span>
          </button>
        ))}

        {rows.length === 0 ? (
          <p className="py-16 text-center text-sm font-bold text-slate-400">
            這班目前沒有工具
            <br />
            <span className="text-xs">到「發放」從公庫發過去</span>
          </p>
        ) : null}

        {rows.length > 0 && visible.length === 0 ? (
          <p className="py-16 text-center text-sm font-bold text-slate-400">找不到符合的工具</p>
        ) : null}
      </div>

      {detail ? (
        <ItemDetailSheet
          classId={classId}
          className={selected?.name}
          item={detail}
          classes={classes}
          onClose={() => setDetail(null)}
          toast={toast}
        />
      ) : null}
    </div>
  );
}

/** 單一品項明細：現有數量 + 這班這項的異動紀錄（對齊公庫「點進去看」） */
function ItemDetailSheet({ classId, className, item, classes, onClose, toast }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  const nameOf = useMemo(() => {
    const map = new Map(classes.map((c) => [c.id, c.name]));
    return (id) => (id == null ? "公庫" : (map.get(id) ?? "—"));
  }, [classes]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .logs({ class_id: classId, item_id: item.id, limit: 50 })
      .then((data) => {
        if (!cancelled) setLogs(data);
      })
      .catch((err) => {
        if (!cancelled) toast?.({ ok: false, msg: err.message });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [classId, item.id, toast]);

  return (
    <Sheet open title={item.name} onClose={onClose}>
      <div className="mb-4 rounded-2xl bg-sky2-50 px-4 py-4 text-center">
        <p className="text-xs font-bold text-slate-400">{className} 目前持有</p>
        <p className="mt-1 text-4xl font-extrabold tabular-nums text-sky2-600">
          {item.qty}
          <span className="ml-1 text-base font-bold text-slate-400">{item.unit}</span>
        </p>
      </div>

      <h3 className="mb-2 text-sm font-extrabold text-slate-500">異動明細</h3>

      {loading ? (
        <p className="py-8 text-center text-sm font-bold text-slate-400">載入中…</p>
      ) : logs.length === 0 ? (
        <p className="py-8 text-center text-sm font-bold text-slate-400">還沒有這項的異動紀錄</p>
      ) : (
        <div className="space-y-2">
          {logs.map((log) => {
            const meta = KINDS[log.kind] || { label: log.kind, chip: "bg-slate-100 text-slate-600" };
            const intoThis = log.to_class === classId;
            const outOfThis = log.from_class === classId;
            const direction =
              log.kind === "DISTRIBUTE"
                ? `公庫 ➔ ${className}`
                : `${nameOf(log.from_class)} ➔ ${nameOf(log.to_class)}`;

            return (
              <div key={log.id} className="rounded-2xl border border-slate-100 px-3 py-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="mb-1 flex flex-wrap items-center gap-1.5">
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-extrabold ${meta.chip}`}>
                        {meta.label}
                      </span>
                      <span className="text-[11px] font-bold text-slate-400">{fmt(log.created_at)}</span>
                    </div>
                    <p className="text-xs font-bold text-slate-500">{direction}</p>
                    <p className="mt-0.5 text-xs font-bold text-slate-400">經手人：{log.operator}</p>
                    {log.note ? (
                      <p className="mt-0.5 text-xs font-bold text-slate-400">備註：{log.note}</p>
                    ) : null}
                  </div>
                  <span
                    className={`shrink-0 text-lg font-extrabold tabular-nums ${
                      intoThis && !outOfThis
                        ? "text-mint-600"
                        : outOfThis && !intoThis
                          ? "text-zest-600"
                          : "text-slate-700"
                    }`}
                  >
                    {intoThis && !outOfThis ? "+" : outOfThis && !intoThis ? "−" : ""}
                    {log.qty}
                    <span className="ml-0.5 text-xs font-bold text-slate-400">{item.unit}</span>
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Sheet>
  );
}
