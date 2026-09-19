import { useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import ClassPicker from "../components/ClassPicker";
import AddClassSheet from "../components/AddClassSheet";
import Sheet from "../components/Sheet";
import { SortableItem, arrayMove } from "../components/SortableItem";
import { api } from "../api";

const LAST_CLASS_KEY = "toolroom_last_class";

const KINDS = {
  RESTOCK: { label: "進貨", chip: "bg-mint-100 text-mint-700" },
  DISTRIBUTE: { label: "發放", chip: "bg-sky2-100 text-sky2-700" },
  TRANSFER: { label: "調貨", chip: "bg-zest-100 text-zest-700" },
  ADJUST: { label: "調整", chip: "bg-violet-100 text-violet-700" },
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

const fmtFull = (iso) =>
  new Date(iso).toLocaleString("zh-TW", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

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
  const [detail, setDetail] = useState(null);
  const [adding, setAdding] = useState(false);
  const [sortingClasses, setSortingClasses] = useState(false);
  const [localClasses, setLocalClasses] = useState(null);
  const [notesOpen, setNotesOpen] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [notes, setNotes] = useState([]);
  const [notesLoading, setNotesLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 160, tolerance: 8 } })
  );

  const itemById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const classList = localClasses ?? classes;

  const pickClass = (id) => {
    setClassId(id);
    setKeyword("");
    setDetail(null);
    setNotesOpen(false);
    setAdjustOpen(false);
    setManageOpen(false);
    if (id) {
      localStorage.setItem(LAST_CLASS_KEY, String(id));
      setPicking(false);
    } else {
      localStorage.removeItem(LAST_CLASS_KEY);
    }
  };

  const loadNotes = async (id = classId) => {
    if (!id) return;
    setNotesLoading(true);
    try {
      setNotes(await api.classNotes(id));
    } catch (err) {
      toast?.({ ok: false, msg: err.message });
    } finally {
      setNotesLoading(false);
    }
  };

  useEffect(() => {
    if (classId && !picking) loadNotes(classId);
    else setNotes([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId, picking]);

  const onClassDragEnd = async (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id || busy) return;
    const oldIndex = classList.findIndex((c) => c.id === active.id);
    const newIndex = classList.findIndex((c) => c.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const next = arrayMove(classList, oldIndex, newIndex).map((c, i) => ({
      ...c,
      sort: (i + 1) * 10,
    }));
    setLocalClasses(next);
    setBusy(true);
    try {
      await api.reorderClasses(next.map((c) => c.id));
      await reload();
      setLocalClasses(null);
    } catch (err) {
      toast?.({ ok: false, msg: err.message });
      setLocalClasses(null);
      await reload();
    } finally {
      setBusy(false);
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
  const latestNote = notes[0] || null;

  if (!classId || picking) {
    return (
      <div className="space-y-4 pb-4">
        <section>
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className="text-sm font-extrabold text-slate-500">選班級看庫存</h2>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setSortingClasses((v) => !v);
                  setLocalClasses(null);
                }}
                className={`rounded-xl px-3 py-1.5 text-xs font-extrabold active:scale-95 ${
                  sortingClasses ? "bg-zest-500 text-white" : "bg-white text-slate-600 shadow-card"
                }`}
              >
                {sortingClasses ? "完成排序" : "排序"}
              </button>
              {!sortingClasses ? (
                <button
                  type="button"
                  onClick={() => setAdding(true)}
                  className="rounded-xl bg-sky2-500 px-3 py-1.5 text-xs font-extrabold text-white active:scale-95"
                >
                  ＋新增
                </button>
              ) : null}
            </div>
          </div>

          {sortingClasses ? (
            <>
              <p className="mb-2 text-xs font-bold text-zest-600">按住 ⋮⋮ 拖曳調整班級順序</p>
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onClassDragEnd}>
                <SortableContext
                  items={classList.map((c) => c.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="space-y-2">
                    {classList.map((c) => (
                      <SortableItem key={c.id} id={c.id} className="card px-2 py-2">
                        <p className="py-2 text-sm font-bold text-slate-800">{c.name}</p>
                      </SortableItem>
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            </>
          ) : (
            <ClassPicker classes={classes} value={classId} onChange={pickClass} tone="sky" />
          )}
        </section>

        {!classId && !sortingClasses ? (
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
      <div className="card flex items-center justify-between gap-2 px-4 py-3">
        <button type="button" onClick={() => setManageOpen(true)} className="min-w-0 flex-1 text-left">
          <p className="text-xs font-bold text-slate-400">目前查看（點名稱可改名／刪除）</p>
          <p className="truncate text-lg font-extrabold text-slate-800">{selected?.name}</p>
        </button>
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

      <button
        type="button"
        onClick={() => setAdjustOpen(true)}
        className="btn-plain w-full border-2 border-dashed border-sky2-300 text-sky2-700"
      >
        調整起始貨量
      </button>

      <button
        type="button"
        onClick={() => setNotesOpen(true)}
        className="card w-full px-4 py-3 text-left active:scale-[0.99]"
      >
        <div className="mb-1 flex items-center justify-between gap-2">
          <p className="text-xs font-extrabold text-slate-400">班級備註</p>
          <p className="text-[11px] font-bold text-sky2-600">
            {latestNote ? "點開看歷史" : "點一下寫備註"}
          </p>
        </div>
        {notesLoading && !latestNote ? (
          <p className="text-sm font-bold text-slate-400">載入中…</p>
        ) : latestNote ? (
          <>
            <p className="line-clamp-2 text-sm font-bold text-slate-800">{latestNote.body}</p>
            <p className="mt-1 text-[11px] font-bold text-slate-400">
              {fmt(latestNote.created_at)}｜{latestNote.operator}
            </p>
          </>
        ) : (
          <p className="text-sm font-bold text-slate-400">還沒有備註，例如：掃具放在窗邊</p>
        )}
      </button>

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
          <p className="py-12 text-center text-sm font-bold text-slate-400">
            這班目前沒有工具
            <br />
            <span className="text-xs">可按「調整起始貨量」，或到「發放」從公庫發</span>
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

      {notesOpen ? (
        <NotesSheet
          className={selected?.name}
          classId={classId}
          notes={notes}
          onClose={() => setNotesOpen(false)}
          onRefresh={loadNotes}
          toast={toast}
        />
      ) : null}

      {adjustOpen ? (
        <AdjustStockSheet
          classId={classId}
          className={selected?.name}
          items={items}
          stock={stock}
          onClose={() => setAdjustOpen(false)}
          onSaved={async () => {
            setAdjustOpen(false);
            await reload();
          }}
          toast={toast}
        />
      ) : null}

      {manageOpen && selected ? (
        <ManageClassSheet
          klass={selected}
          onClose={() => setManageOpen(false)}
          onRenamed={async (name) => {
            await api.updateClass(selected.id, { name });
            toast?.({ ok: true, msg: "已改名" });
            setManageOpen(false);
            await reload();
          }}
          onDeleted={async () => {
            if (!confirm(`確定刪除「${selected.name}」？\n該班庫存與備註會一起刪掉，流水帳會保留。`))
              return;
            await api.deleteClass(selected.id);
            toast?.({ ok: true, msg: "已刪除班級" });
            localStorage.removeItem(LAST_CLASS_KEY);
            setClassId(null);
            setPicking(true);
            setManageOpen(false);
            await reload();
          }}
          toast={toast}
        />
      ) : null}
    </div>
  );
}

function ManageClassSheet({ klass, onClose, onRenamed, onDeleted, toast }) {
  const [name, setName] = useState(klass.name);
  const [busy, setBusy] = useState(false);

  return (
    <Sheet
      open
      title="班級設定"
      onClose={onClose}
      footer={
        <div className="space-y-2">
          <button
            className="btn-mint w-full"
            disabled={busy || !name.trim() || name.trim() === klass.name}
            onClick={async () => {
              setBusy(true);
              try {
                await onRenamed(name.trim());
              } catch (err) {
                toast?.({ ok: false, msg: err.message });
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "儲存中…" : "儲存新名稱"}
          </button>
          <button
            className="btn-plain w-full text-rose-500"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onDeleted();
              } catch (err) {
                toast?.({ ok: false, msg: err.message });
              } finally {
                setBusy(false);
              }
            }}
          >
            刪除此班級
          </button>
        </div>
      }
    >
      <label className="mb-1 block text-sm font-bold text-slate-500">名稱</label>
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="field text-center text-lg font-extrabold"
      />
    </Sheet>
  );
}

function NotesSheet({ className, classId, notes, onClose, onRefresh, toast }) {
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(null); // note | null

  const submit = async () => {
    const clean = body.trim();
    if (!clean || busy) return;
    setBusy(true);
    try {
      await api.addClassNote(classId, { body: clean });
      setBody("");
      await onRefresh();
      toast?.({ ok: true, msg: "已新增備註" });
    } catch (err) {
      toast?.({ ok: false, msg: err.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open
      title={`${className}｜備註`}
      onClose={onClose}
      footer={
        <button className="btn-mint w-full" disabled={busy || !body.trim()} onClick={submit}>
          {busy ? "儲存中…" : "新增這筆備註"}
        </button>
      }
    >
      <textarea
        autoFocus
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={3}
        placeholder="寫下想記的事…"
        className="field resize-none"
      />

      <h3 className="mb-2 mt-4 text-sm font-extrabold text-slate-500">
        歷史紀錄 <span className="font-bold text-slate-400">（長按可改／刪）</span>
      </h3>
      {notes.length === 0 ? (
        <p className="py-6 text-center text-sm font-bold text-slate-400">還沒有歷史備註</p>
      ) : (
        <div className="space-y-2">
          {notes.map((n) => (
            <LongPressNote
              key={n.id}
              note={n}
              onLongPress={() => setEditing(n)}
            />
          ))}
        </div>
      )}

      {editing ? (
        <EditNoteSheet
          note={editing}
          onClose={() => setEditing(null)}
          onSave={async (text) => {
            await api.updateClassNote(classId, editing.id, { body: text });
            toast?.({ ok: true, msg: "已更新備註" });
            setEditing(null);
            await onRefresh();
          }}
          onDelete={async () => {
            if (!confirm("確定刪除這筆備註？")) return;
            await api.deleteClassNote(classId, editing.id);
            toast?.({ ok: true, msg: "已刪除備註" });
            setEditing(null);
            await onRefresh();
          }}
          toast={toast}
        />
      ) : null}
    </Sheet>
  );
}

function LongPressNote({ note, onLongPress }) {
  const timer = useRef(null);
  const moved = useRef(false);

  const start = () => {
    moved.current = false;
    timer.current = setTimeout(() => onLongPress(), 450);
  };
  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };

  return (
    <div
      className="select-none rounded-2xl border border-slate-100 px-3 py-3 active:bg-slate-50"
      onTouchStart={start}
      onTouchMove={() => {
        moved.current = true;
        clear();
      }}
      onTouchEnd={clear}
      onTouchCancel={clear}
      onContextMenu={(e) => {
        e.preventDefault();
        onLongPress();
      }}
      onMouseDown={start}
      onMouseUp={clear}
      onMouseLeave={clear}
    >
      <p className="whitespace-pre-wrap text-sm font-bold text-slate-800">{note.body}</p>
      <p className="mt-1 text-[11px] font-bold text-slate-400">
        {fmtFull(note.created_at)}｜{note.operator}
      </p>
    </div>
  );
}

function EditNoteSheet({ note, onClose, onSave, onDelete, toast }) {
  const [text, setText] = useState(note.body);
  const [busy, setBusy] = useState(false);

  return (
    <Sheet
      open
      title="編輯備註"
      onClose={onClose}
      footer={
        <div className="space-y-2">
          <button
            className="btn-mint w-full"
            disabled={busy || !text.trim()}
            onClick={async () => {
              setBusy(true);
              try {
                await onSave(text.trim());
              } catch (err) {
                toast?.({ ok: false, msg: err.message });
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "儲存中…" : "儲存修改"}
          </button>
          <button
            className="btn-plain w-full text-rose-500"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onDelete();
              } catch (err) {
                toast?.({ ok: false, msg: err.message });
              } finally {
                setBusy(false);
              }
            }}
          >
            刪除這筆備註
          </button>
        </div>
      }
    >
      <textarea
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={4}
        className="field resize-none"
      />
    </Sheet>
  );
}

function AdjustStockSheet({ classId, className, items, stock, onClose, onSaved, toast }) {
  const current = useMemo(() => {
    const map = new Map();
    for (const s of stock) {
      if (s.class_id === classId) map.set(s.item_id, s.qty);
    }
    return map;
  }, [stock, classId]);

  const ordered = useMemo(
    () => [...items].sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0) || a.name.localeCompare(b.name, "zh-Hant")),
    [items]
  );

  const [draft, setDraft] = useState(() => {
    const init = {};
    for (const i of items) init[i.id] = String(current.get(i.id) ?? 0);
    return init;
  });
  const [busy, setBusy] = useState(false);
  const [keyword, setKeyword] = useState("");

  const kw = keyword.trim();
  const visible = kw ? ordered.filter((i) => i.name.includes(kw)) : ordered;

  const changed = ordered
    .map((i) => {
      const next = Math.trunc(Number(draft[i.id]));
      const prev = current.get(i.id) ?? 0;
      if (!Number.isInteger(next) || next < 0) return null;
      if (next === prev) return null;
      return { item_id: i.id, qty: next };
    })
    .filter(Boolean);

  const submit = async () => {
    if (busy || changed.length === 0) return;
    setBusy(true);
    try {
      await api.setClassStock(classId, { items: changed, note: "起始／調整貨量" });
      toast?.({ ok: true, msg: `已更新 ${changed.length} 項貨量` });
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
      title={`調整｜${className}`}
      onClose={onClose}
      footer={
        <button className="btn-mint w-full" disabled={busy || changed.length === 0} onClick={submit}>
          {busy ? "儲存中…" : changed.length ? `儲存 ${changed.length} 項變更` : "尚未修改"}
        </button>
      }
    >
      <p className="mb-3 text-sm font-bold text-slate-500">
        直接填這班「現在應該有多少」。不會從公庫扣除。
      </p>
      <input
        value={keyword}
        onChange={(e) => setKeyword(e.target.value)}
        placeholder="搜尋工具…"
        className="field mb-3"
      />
      <div className="space-y-2">
        {visible.map((item) => {
          const prev = current.get(item.id) ?? 0;
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
            let direction;
            if (log.kind === "ADJUST") direction = "自行調整";
            else if (log.kind === "DISTRIBUTE") direction = `公庫 ➔ ${className}`;
            else direction = `${nameOf(log.from_class)} ➔ ${nameOf(log.to_class)}`;

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
                  <span className="shrink-0 text-lg font-extrabold tabular-nums text-slate-700">
                    {log.kind === "ADJUST"
                      ? `Δ${log.qty}`
                      : `${intoThis && !outOfThis ? "+" : outOfThis && !intoThis ? "−" : ""}${log.qty}`}
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
