import { useCallback, useEffect, useMemo, useState } from "react";
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

/** 待辦：未完成（可置頂、拖曳）／完成（預設收折） */
export default function TodoPage({ toast }) {
  const [todos, setTodos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [doneOpen, setDoneOpen] = useState(false);
  const [sheet, setSheet] = useState(null); // null | { mode:'create'|'edit', todo? }
  const [busy, setBusy] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } })
  );

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setTodos(await api.todos());
    } catch (err) {
      toast?.({ ok: false, msg: err.message });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    reload();
  }, [reload]);

  const openList = useMemo(() => {
    const open = todos.filter((t) => !t.done);
    const pinned = open.filter((t) => t.pinned).sort((a, b) => a.sort - b.sort || a.id - b.id);
    const rest = open.filter((t) => !t.pinned).sort((a, b) => a.sort - b.sort || a.id - b.id);
    return [...pinned, ...rest];
  }, [todos]);

  const doneList = useMemo(
    () => todos.filter((t) => t.done).sort((a, b) => a.sort - b.sort || a.id - b.id),
    [todos]
  );

  const persistOrder = async (list) => {
    const ids = list.map((t) => t.id);
    // 樂觀更新本地
    setTodos((prev) => {
      const map = new Map(prev.map((t) => [t.id, t]));
      ids.forEach((id, i) => {
        const row = map.get(id);
        if (row) map.set(id, { ...row, sort: i + 1 });
      });
      return [...map.values()];
    });
    try {
      await api.reorderTodos(ids);
    } catch (err) {
      toast?.({ ok: false, msg: err.message });
      await reload();
    }
  };

  const onDragEnd = async (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = openList.findIndex((t) => t.id === active.id);
    const newIndex = openList.findIndex((t) => t.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const next = arrayMove(openList, oldIndex, newIndex);
    await persistOrder(next);
  };

  const toggleDone = async (todo) => {
    try {
      await api.updateTodo(todo.id, { done: !todo.done });
      await reload();
    } catch (err) {
      toast?.({ ok: false, msg: err.message });
    }
  };

  const togglePin = async (todo) => {
    try {
      await api.updateTodo(todo.id, { pinned: !todo.pinned });
      await reload();
    } catch (err) {
      toast?.({ ok: false, msg: err.message });
    }
  };

  const remove = async (todo) => {
    if (!confirm(`確定刪除待辦「${todo.body}」？`)) return;
    try {
      await api.deleteTodo(todo.id);
      toast?.({ ok: true, msg: "已刪除" });
      await reload();
    } catch (err) {
      toast?.({ ok: false, msg: err.message });
    }
  };

  const saveSheet = async ({ body, pinned }) => {
    setBusy(true);
    try {
      if (sheet.mode === "create") {
        await api.createTodo({ body, pinned });
        toast?.({ ok: true, msg: "已新增待辦" });
      } else {
        await api.updateTodo(sheet.todo.id, { body, pinned });
        toast?.({ ok: true, msg: "已更新" });
      }
      setSheet(null);
      await reload();
    } catch (err) {
      toast?.({ ok: false, msg: err.message });
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <p className="py-16 text-center text-sm font-bold text-slate-400">載入中…</p>;
  }

  return (
    <div className="space-y-4 pb-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-extrabold text-slate-800">待辦事項</h2>
          <p className="text-xs font-bold text-slate-400">長按左側 ⋮⋮ 拖曳排序</p>
        </div>
        <button className="btn-mint shrink-0 px-4" onClick={() => setSheet({ mode: "create" })}>
          ＋新增
        </button>
      </div>

      <section className="space-y-2">
        <h3 className="text-sm font-extrabold text-slate-500">
          未完成 <span className="text-slate-400">({openList.length})</span>
        </h3>

        {openList.length === 0 ? (
          <p className="rounded-2xl bg-white/70 py-10 text-center text-sm font-bold text-slate-400">
            目前沒有未完成的待辦
          </p>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={openList.map((t) => t.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-2">
                {openList.map((todo) => (
                  <SortableItem key={todo.id} id={todo.id} className="card px-2 py-2">
                    <TodoRow
                      todo={todo}
                      onToggle={() => toggleDone(todo)}
                      onPin={() => togglePin(todo)}
                      onEdit={() => setSheet({ mode: "edit", todo })}
                      onDelete={() => remove(todo)}
                    />
                  </SortableItem>
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </section>

      <section>
        <button
          type="button"
          onClick={() => setDoneOpen((v) => !v)}
          className="mb-2 flex w-full items-center justify-between rounded-2xl bg-white px-4 py-3 text-left shadow-card"
        >
          <span className="text-sm font-extrabold text-slate-500">
            完成 <span className="text-slate-400">({doneList.length})</span>
          </span>
          <span className="text-xs font-bold text-slate-400">{doneOpen ? "收合 ▲" : "展開 ▼"}</span>
        </button>

        {doneOpen ? (
          <div className="space-y-2">
            {doneList.length === 0 ? (
              <p className="py-6 text-center text-sm font-bold text-slate-400">還沒有完成的項目</p>
            ) : (
              doneList.map((todo) => (
                <div key={todo.id} className="card px-3 py-2 opacity-80">
                  <TodoRow
                    todo={todo}
                    onToggle={() => toggleDone(todo)}
                    onEdit={() => setSheet({ mode: "edit", todo })}
                    onDelete={() => remove(todo)}
                  />
                </div>
              ))
            )}
          </div>
        ) : null}
      </section>

      {sheet ? (
        <TodoSheet
          mode={sheet.mode}
          todo={sheet.todo}
          busy={busy}
          onClose={() => setSheet(null)}
          onSave={saveSheet}
        />
      ) : null}
    </div>
  );
}

function TodoRow({ todo, onToggle, onPin, onEdit, onDelete }) {
  return (
    <div className="flex items-center gap-2 py-1">
      <button
        type="button"
        onClick={onToggle}
        className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-extrabold ${
          todo.done ? "bg-mint-500 text-white" : "border-2 border-slate-300 text-transparent"
        }`}
        aria-label={todo.done ? "標為未完成" : "標為完成"}
      >
        ✓
      </button>

      <button type="button" onClick={onEdit} className="min-w-0 flex-1 text-left">
        <span
          className={`block text-sm font-bold ${
            todo.done ? "text-slate-400 line-through" : "text-slate-800"
          }`}
        >
          {todo.pinned && !todo.done ? <span className="mr-1 text-zest-500">📌</span> : null}
          {todo.body}
        </span>
      </button>

      {!todo.done && onPin ? (
        <button
          type="button"
          onClick={onPin}
          className={`shrink-0 rounded-lg px-2 py-1 text-xs font-extrabold ${
            todo.pinned ? "bg-zest-100 text-zest-700" : "bg-slate-100 text-slate-400"
          }`}
        >
          置頂
        </button>
      ) : null}

      <button
        type="button"
        onClick={onDelete}
        className="shrink-0 rounded-lg bg-rose-50 px-2 py-1 text-xs font-extrabold text-rose-500"
      >
        刪
      </button>
    </div>
  );
}

function TodoSheet({ mode, todo, busy, onClose, onSave }) {
  const [body, setBody] = useState(todo?.body ?? "");
  const [pinned, setPinned] = useState(Boolean(todo?.pinned));

  return (
    <Sheet
      open
      title={mode === "create" ? "新增待辦" : "編輯待辦"}
      onClose={onClose}
      footer={
        <button
          className="btn-mint w-full"
          disabled={busy || !body.trim()}
          onClick={() => onSave({ body: body.trim(), pinned })}
        >
          {busy ? "儲存中…" : "儲存"}
        </button>
      }
    >
      <textarea
        autoFocus
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={4}
        placeholder="要做什麼？"
        className="field resize-none"
      />
      {!todo?.done ? (
        <label className="mt-3 flex items-center gap-2 text-sm font-bold text-slate-600">
          <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} />
          置頂（排在未完成最上面）
        </label>
      ) : null}
    </Sheet>
  );
}
