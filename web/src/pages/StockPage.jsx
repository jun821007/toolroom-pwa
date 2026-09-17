import { useMemo, useState } from "react";
import Sheet from "../components/Sheet";
import { api } from "../api";

/** 衛生組公庫：品項清單、快速補貨、新增／編輯品項 */
export default function StockPage({ items, reload, toast }) {
  const [keyword, setKeyword] = useState("");
  const [sheet, setSheet] = useState(null); // { mode:'restock'|'create'|'edit', item }
  const [busy, setBusy] = useState(false);

  const kw = keyword.trim();
  const visible = useMemo(
    () => (kw ? items.filter((i) => i.name.includes(kw)) : items),
    [items, kw]
  );
  const total = items.reduce((s, i) => s + i.qty, 0);

  const run = async (fn, okMsg) => {
    setBusy(true);
    try {
      await fn();
      setSheet(null);
      await reload();
      toast({ ok: true, msg: okMsg });
    } catch (err) {
      toast({ ok: false, msg: err.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="card px-4 py-3">
          <p className="text-xs font-bold text-slate-400">品項</p>
          <p className="text-2xl font-extrabold text-mint-600">{items.length}</p>
        </div>
        <div className="card px-4 py-3">
          <p className="text-xs font-bold text-slate-400">總件數</p>
          <p className="text-2xl font-extrabold text-sky2-600">{total.toLocaleString("zh-TW")}</p>
        </div>
      </div>

      <div className="flex gap-2">
        <input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="搜尋工具…"
          className="field"
        />
        <button className="btn-mint shrink-0 px-4" onClick={() => setSheet({ mode: "create" })}>
          ＋
        </button>
      </div>

      <div className="space-y-2">
        {visible.map((item) => (
          <div key={item.id} className="card flex items-center gap-3 px-4 py-3">
            <button
              className="min-w-0 flex-1 text-left"
              onClick={() => setSheet({ mode: "edit", item })}
            >
              <span className="block truncate text-base font-bold text-slate-800">{item.name}</span>
              <span className="text-xs font-bold text-slate-400">點一下可改名稱或單位</span>
            </button>

            <span
              className={`shrink-0 text-2xl font-extrabold tabular-nums ${
                item.qty === 0 ? "text-rose-500" : "text-slate-700"
              }`}
            >
              {item.qty}
              <span className="ml-0.5 text-xs font-bold text-slate-400">{item.unit}</span>
            </span>

            <button
              className="shrink-0 rounded-xl bg-mint-500 px-3 py-2.5 text-sm font-extrabold text-white active:scale-95"
              onClick={() => setSheet({ mode: "restock", item })}
            >
              補貨
            </button>
          </div>
        ))}

        {visible.length === 0 ? (
          <p className="py-16 text-center text-sm font-bold text-slate-400">找不到符合的工具</p>
        ) : null}
      </div>

      {sheet?.mode === "restock" ? (
        <RestockSheet item={sheet.item} busy={busy} onClose={() => setSheet(null)} onRun={run} />
      ) : null}

      {sheet?.mode === "create" || sheet?.mode === "edit" ? (
        <ItemSheet
          mode={sheet.mode}
          item={sheet.item}
          busy={busy}
          onClose={() => setSheet(null)}
          onRun={run}
        />
      ) : null}
    </div>
  );
}

function RestockSheet({ item, busy, onClose, onRun }) {
  const [qty, setQty] = useState("");
  const n = parseInt(qty, 10);
  const valid = Number.isInteger(n) && n > 0;

  return (
    <Sheet
      open
      title={`補貨：${item.name}`}
      onClose={onClose}
      footer={
        <button
          className="btn-mint w-full"
          disabled={busy || !valid}
          onClick={() =>
            onRun(
              () => api.restock(item.id, { qty: n }),
              `${item.name} 已入庫 ${n} ${item.unit}`
            )
          }
        >
          {busy ? "處理中…" : `確認入庫（${item.qty} → ${item.qty + (valid ? n : 0)}）`}
        </button>
      }
    >
      <p className="mb-3 text-sm font-bold text-slate-500">
        目前公庫 {item.qty} {item.unit}
      </p>

      <input
        type="number"
        inputMode="numeric"
        autoFocus
        value={qty}
        onChange={(e) => setQty(e.target.value)}
        placeholder="要補幾個？"
        className="field text-center text-2xl font-extrabold"
      />

      <div className="mt-3 grid grid-cols-4 gap-2">
        {[1, 5, 10, 20].map((n2) => (
          <button
            key={n2}
            onClick={() => setQty(String((parseInt(qty, 10) || 0) + n2))}
            className="min-h-[3rem] rounded-2xl bg-mint-100 text-base font-extrabold text-mint-700 active:scale-95"
          >
            +{n2}
          </button>
        ))}
      </div>
    </Sheet>
  );
}

function ItemSheet({ mode, item, busy, onClose, onRun }) {
  const isNew = mode === "create";
  const [name, setName] = useState(item?.name ?? "");
  const [unit, setUnit] = useState(item?.unit ?? "支");
  const [qty, setQty] = useState("0");

  return (
    <Sheet
      open
      title={isNew ? "新增工具品項" : "編輯品項"}
      onClose={onClose}
      footer={
        <div className="space-y-2">
          <button
            className="btn-mint w-full"
            disabled={busy || !name.trim()}
            onClick={() =>
              onRun(
                () =>
                  isNew
                    ? api.createItem({ name, unit, qty: parseInt(qty, 10) || 0 })
                    : api.updateItem(item.id, { name, unit }),
                isNew ? `已新增「${name.trim()}」` : "已更新"
              )
            }
          >
            {busy ? "處理中…" : isNew ? "建立" : "儲存"}
          </button>

          {!isNew ? (
            <button
              className="btn-plain w-full text-rose-500"
              disabled={busy}
              onClick={() => {
                if (!confirm(`確定要停用「${item.name}」嗎？歷史流水會保留。`)) return;
                onRun(() => api.deleteItem(item.id), `已停用「${item.name}」`);
              }}
            >
              停用此品項
            </button>
          ) : null}
        </div>
      }
    >
      <div className="space-y-3">
        <div>
          <label className="mb-1 block text-sm font-bold text-slate-500">名稱</label>
          <input
            autoFocus={isNew}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例如：竹掃把"
            className="field"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-bold text-slate-500">單位</label>
          <div className="flex flex-wrap gap-2">
            {["支", "個", "把", "條", "瓶", "罐", "包"].map((u) => (
              <button
                key={u}
                onClick={() => setUnit(u)}
                className={`min-h-[2.75rem] w-14 rounded-2xl border-2 text-base font-bold ${
                  unit === u
                    ? "border-mint-500 bg-mint-500 text-white"
                    : "border-slate-200 bg-white text-slate-600"
                }`}
              >
                {u}
              </button>
            ))}
          </div>
        </div>

        {isNew ? (
          <div>
            <label className="mb-1 block text-sm font-bold text-slate-500">初始庫存</label>
            <input
              type="number"
              inputMode="numeric"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              className="field"
            />
          </div>
        ) : null}
      </div>
    </Sheet>
  );
}
