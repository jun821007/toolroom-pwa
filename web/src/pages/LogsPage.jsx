import { useEffect, useMemo, useState } from "react";
import { api } from "../api";

const KINDS = {
  RESTOCK: { label: "進貨", chip: "bg-mint-100 text-mint-700", bar: "bg-mint-400" },
  DISTRIBUTE: { label: "發放", chip: "bg-sky2-100 text-sky2-700", bar: "bg-sky2-400" },
  TRANSFER: { label: "調貨", chip: "bg-zest-100 text-zest-700", bar: "bg-zest-400" },
  ADJUST: { label: "調整", chip: "bg-violet-100 text-violet-700", bar: "bg-violet-400" },
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

/** 流水帳：時間、來源、去向、品項、數量、經手人 */
export default function LogsPage({ classes, items, toast }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [kind, setKind] = useState("");
  const [classId, setClassId] = useState("");

  const nameOf = useMemo(() => {
    const map = new Map(classes.map((c) => [c.id, c.name]));
    return (id) => (id == null ? "衛生組公庫" : (map.get(id) ?? "—"));
  }, [classes]);

  const itemName = useMemo(() => {
    const map = new Map(items.map((i) => [i.id, i]));
    return (id) => map.get(id) ?? { name: "（已停用品項）", unit: "" };
  }, [items]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    api
      .logs({ kind, class_id: classId })
      .then((data) => {
        if (!cancelled) setLogs(data);
      })
      .catch((err) => toast({ ok: false, msg: err.message }))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [kind, classId, toast]);

  return (
    <div className="space-y-3">
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        <Tab active={kind === ""} onClick={() => setKind("")}>
          全部
        </Tab>
        {Object.entries(KINDS).map(([key, k]) => (
          <Tab key={key} active={kind === key} onClick={() => setKind(kind === key ? "" : key)}>
            {k.label}
          </Tab>
        ))}
      </div>

      <select value={classId} onChange={(e) => setClassId(e.target.value)} className="field">
        <option value="">全部班級</option>
        {classes.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>

      {loading ? (
        <p className="py-16 text-center text-sm font-bold text-slate-400">載入中…</p>
      ) : logs.length === 0 ? (
        <p className="py-16 text-center text-sm font-bold text-slate-400">沒有符合的紀錄</p>
      ) : (
        <div className="space-y-2">
          {logs.map((log) => {
            const k = KINDS[log.kind];
            const item = itemName(log.item_id);

            return (
              <div key={log.id} className="card flex overflow-hidden">
                <span className={`w-1.5 shrink-0 ${k.bar}`} />

                <div className="min-w-0 flex-1 px-4 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className={`chip ${k.chip}`}>{k.label}</span>
                    <span className="text-xs font-bold text-slate-400">{fmt(log.created_at)}</span>
                  </div>

                  <p className="mt-1.5 text-sm font-extrabold text-slate-800">
                    {log.kind === "ADJUST"
                      ? log.to_class == null && log.from_class == null
                        ? "衛生組公庫（調整貨量）"
                        : `${nameOf(log.to_class)}（自行調整）`
                      : log.kind === "RESTOCK"
                        ? "衛生組公庫"
                        : (
                          <>
                            {nameOf(log.from_class)} <span className="text-zest-500">➔</span>{" "}
                            {nameOf(log.to_class)}
                          </>
                        )}
                  </p>

                  <p className="text-sm font-bold text-slate-600">
                    {item.name}{" "}
                    <span className="text-zest-600">
                      × {log.qty} {item.unit}
                    </span>
                  </p>

                  <p className="mt-0.5 text-xs font-bold text-slate-400">
                    經手人：{log.operator}
                    {log.note ? `｜${log.note}` : ""}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Tab({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 rounded-full px-4 py-2 text-sm font-bold transition ${
        active ? "bg-slate-800 text-white" : "bg-white text-slate-500"
      }`}
    >
      {children}
    </button>
  );
}
