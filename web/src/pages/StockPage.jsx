import { useMemo, useState } from "react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import Sheet from "../components/Sheet";
import { SortableItem, arrayMove } from "../components/SortableItem";
import { api } from "../api";

/** 衛生組公庫：品項清單、拖曳排序、快速補貨、新增／編輯品項 */
export default function StockPage({ items, reload, toast }) {
  const [keyword, setKeyword] = useState("");
  const [sheet, setSheet] = useState(null);
  const [busy, setBusy] = useState(false);
  const [sorting, setSorting] = useState(false);
  const [localOrder, setLocalOrder] = useState(null);
  const [adjustOpen, setAdjustOpen] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 160, tolerance: 8 } })
  );

  const kw = keyword.trim();
  const searching = Boolean(kw);

  const ordered = useMemo(() => {
    const base = localOrder ?? items;
    return [...base].sort(
      (a, b) => (a.sort ?? 0) - (b.sort ?? 0) || a.name.localeCompare(b.name, "zh-Hant")
    );
  }, [items, localOrder]);

  const visible = useMemo(
    () => (searching ? ordered.filter((i) => i.name.includes(kw)) : ordered),
    [ordered, searching, kw]
  );
  const total = items.reduce((s, i) => s + i.qty, 0);

  const run = async (fn, okMsg) => {
    setBusy(true);
    try {
      await fn();
      setSheet(null);
      setLocalOrder(null);
      await reload();
      toast({ ok: true, msg: okMsg });
    } catch (err) {
      toast({ ok: false, msg: err.message });
    } finally {
      setBusy(false);
    }
  };

  const onDragEnd = async (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id || busy) return;
    const oldIndex = ordered.findIndex((i) => i.id === active.id);
    const newIndex = ordered.findIndex((i) => i.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;

    const next = arrayMove(ordered, oldIndex, newIndex).map((item, i) => ({
      ...item,
      sort: i + 1,
    }));
    setLocalOrder(next);
    setBusy(true);
    try {
      await api.reorderItems(next.map((i) => i.id));
      await reload();
      setLocalOrder(null);
    } catch (err) {
      toast({ ok: false, msg: err.message });
      setLocalOrder(null);
      await reload();
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

      <button
        type="button"
        onClick={() => setAdjustOpen(true)}
        className="btn-plain w-full border-2 border-dashed border-mint-300 text-mint-700"
        disabled={sorting}
      >
        調整起始貨量
      </button>

      <div className="flex gap-2">
        <input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="搜尋工具…"
          className="field"
          disabled={sorting}
        />
        <button
          type="button"
          className={`shrink-0 rounded-2xl px-3 text-sm font-extrabold active:scale-95 ${
            sorting ? "bg-zest-500 text-white" : "bg-white text-slate-600 shadow-card"
          }`}
          onClick={() => {
            setSorting((v) => !v);
            setKeyword("");
            setLocalOrder(null);
          }}
        >
          {sorting ? "完成" : "排序"}
        </button>
        {!sorting ? (
          <button className="btn-mint shrink-0 px-4" onClick={() => setSheet({ mode: "create" })}>
            ＋
          </button>
        ) : null}
      </div>

      {sorting ? (
        <p className="text-xs font-bold text-zest-600">按住左側 ⋮⋮ 拖曳調整順序</p>
      ) : null}

      {sorting && !searching ? (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={ordered.map((i) => i.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-2">
              {ordered.map((item) => (
                <SortableItem key={item.id} id={item.id} className="card px-2 py-2">
                  <div className="flex items-center gap-2 py-1">
                    <span className="min-w-0 flex-1 truncate text-base font-bold text-slate-800">
                      {item.name}
                    </span>
                    <span className="shrink-0 text-xl font-extrabold tabular-nums text-slate-700">
                      {item.qty}
                      <span className="ml-0.5 text-xs font-bold text-slate-400">{item.unit}</span>
                    </span>
                  </div>
                </SortableItem>
              ))}
            </div>
          </SortableContext>
        </DndContext>
      ) : (
        <div className="space-y-2">
          {visible.map((item) => (
            <div key={item.id} className="card flex items-center gap-2 px-3 py-3 sm:gap-3 sm:px-4">
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
      )}

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

      {adjustOpen ? (
        <AdjustPublicStockSheet
          items={ordered}
          onClose={() => setAdjustOpen(false)}
          onSaved={async () => {
            setAdjustOpen(false);
            await reload();
          }}
          toast={toast}
        />
      ) : null}
    </div>
  );
}

/** 一次設定公庫多個品項的絕對數量（盤點／起始貨量） */
function AdjustPublicStockSheet({ items, onClose, onSaved, toast }) {
  const [draft, setDraft] = useState(() => {
    const init = {};
    for (const i of items) init[i.id] = String(i.qty ?? 0);
    return init;
  });
  const [busy, setBusy] = useState(false);
  const [keyword, setKeyword] = useState("");

  const kw = keyword.trim();
  const visible = kw ? items.filter((i) => i.name.includes(kw)) : items;

  const changed = items
    .map((i) => {
      const next = Math.trunc(Number(draft[i.id]));
      const prev = i.qty ?? 0;
      if (!Number.isInteger(next) || next < 0) return null;
      if (next === prev) return null;
      return { item_id: i.id, qty: next };
    })
    .filter(Boolean);

  const submit = async () => {
    if (busy || changed.length === 0) return;
    setBusy(true);
    try {
      await api.setPublicStock({ items: changed, note: "公庫起始／調整貨量" });
      toast?.({ ok: true, msg: `已更新 ${changed.length} 項公庫貨量` });
      await onSaved();
    } catch (err) {
      toast?.({ ok: false, msg: err.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open
      title="調整公庫貨量"
      onClose={onClose}
      footer={
        <button className="btn-mint w-full" disabled={busy || changed.length === 0} onClick={submit}>
          {busy ? "儲存中…" : changed.length ? `儲存 ${changed.length} 項變更` : "尚未修改"}
        </button>
      }
    >
      <p className="mb-3 text-sm font-bold text-slate-500">
        直接填公庫「現在應該有多少」。適合登記起始貨量或盤點修正；與「補貨」不同，這裡是設成絕對數量。
      </p>
      <input
        value={keyword}
        onChange={(e) => setKeyword(e.target.value)}
        placeholder="搜尋工具…"
        className="field mb-3"
      />
      <div className="space-y-2">
        {visible.map((item) => {
          const prev = item.qty ?? 0;
          const dirty = String(prev) !== String(draft[item.id] ?? "0");
          return (
            <div
              key={item.id}
              className={`flex items-center gap-3 rounded-2xl border px-3 py-2.5 ${
                dirty ? "border-mint-400 bg-mint-50" : "border-slate-100 bg-white"
              }`}
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-slate-800">{item.name}</p>
                <p className="text-[11px] font-bold text-slate-400">
                  目前 {prev} {item.unit}
                </p>
              </div>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                value={draft[item.id] ?? "0"}
                onChange={(e) => setDraft((d) => ({ ...d, [item.id]: e.target.value }))}
                className="h-11 w-20 rounded-xl border-2 border-slate-200 text-center text-lg font-extrabold outline-none focus:border-mint-400"
              />
            </div>
          );
        })}
      </div>
    </Sheet>
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
