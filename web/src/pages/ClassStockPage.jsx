import { useMemo, useState } from "react";
import ClassPicker from "../components/ClassPicker";

const LAST_CLASS_KEY = "toolroom_last_class";

/** 查各班目前持有量（只讀；異動請走發放／調貨） */
export default function ClassStockPage({ classes, items, stock }) {
  const [classId, setClassId] = useState(() => {
    const saved = Number(localStorage.getItem(LAST_CLASS_KEY));
    return Number.isInteger(saved) && saved > 0 ? saved : null;
  });
  const [keyword, setKeyword] = useState("");

  const itemById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);

  const pickClass = (id) => {
    setClassId(id);
    setKeyword("");
    if (id) localStorage.setItem(LAST_CLASS_KEY, String(id));
    else localStorage.removeItem(LAST_CLASS_KEY);
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

  const kw = keyword.trim();
  const visible = kw ? rows.filter((r) => r.name.includes(kw)) : rows;
  const totalQty = rows.reduce((s, r) => s + r.qty, 0);
  const selected = classes.find((c) => c.id === classId);

  return (
    <div className="space-y-4 pb-4">
      <section>
        <h2 className="mb-2 text-sm font-extrabold text-slate-500">選班級</h2>
        <ClassPicker classes={classes} value={classId} onChange={pickClass} tone="sky" />
      </section>

      {!classId ? (
        <p className="py-12 text-center text-sm font-bold text-slate-400">點上方班級，看它手上有什麼</p>
      ) : (
        <section className="animate-up space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="card px-4 py-3">
              <p className="text-xs font-bold text-slate-400">品項</p>
              <p className="text-2xl font-extrabold text-sky2-600">{rows.length}</p>
            </div>
            <div className="card px-4 py-3">
              <p className="text-xs font-bold text-slate-400">總件數</p>
              <p className="text-2xl font-extrabold text-mint-600">
                {totalQty.toLocaleString("zh-TW")}
              </p>
            </div>
          </div>

          <p className="text-sm font-extrabold text-slate-700">{selected?.name} 的庫存</p>

          {rows.length > 0 ? (
            <input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="搜尋工具…"
              className="field"
            />
          ) : null}

          <div className="space-y-2">
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
              <p className="py-12 text-center text-sm font-bold text-slate-400">
                這班目前沒有工具
                <br />
                <span className="text-xs">到「發放」從公庫發過去</span>
              </p>
            ) : null}

            {rows.length > 0 && visible.length === 0 ? (
              <p className="py-12 text-center text-sm font-bold text-slate-400">找不到符合的工具</p>
            ) : null}
          </div>
        </section>
      )}
    </div>
  );
}
