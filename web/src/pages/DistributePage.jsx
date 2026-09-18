import { useState } from "react";
import ClassPicker from "../components/ClassPicker";
import AddClassSheet from "../components/AddClassSheet";
import ItemPicker from "../components/ItemPicker";
import { api } from "../api";

/** 公庫 ➔ 班級批量發放 */
export default function DistributePage({ classes, items, reload, toast }) {
  const [toClass, setToClass] = useState(null);
  const [picked, setPicked] = useState({});
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);

  const options = [...items]
    .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0) || a.name.localeCompare(b.name, "zh-Hant"))
    .map((i) => ({ id: i.id, name: i.name, unit: i.unit, available: i.qty }));
  const lines = Object.entries(picked).map(([id, qty]) => ({ item_id: Number(id), qty }));
  const totalQty = lines.reduce((s, l) => s + l.qty, 0);
  const target = classes.find((c) => c.id === toClass);

  const submit = async () => {
    setBusy(true);
    try {
      await api.distribute({ to_class_id: toClass, items: lines, note });
      setPicked({});
      setNote("");
      await reload();
      toast({ ok: true, msg: `已發放 ${totalQty} 件給${target.name}` });
    } catch (err) {
      toast({ ok: false, msg: err.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4 pb-28">
      <section>
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="text-sm font-extrabold text-slate-500">① 發給哪一班？</h2>
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="rounded-xl bg-sky2-500 px-3 py-1.5 text-xs font-extrabold text-white active:scale-95"
          >
            ＋新增班級
          </button>
        </div>
        <ClassPicker classes={classes} value={toClass} onChange={setToClass} tone="sky" />
      </section>

      {toClass ? (
        <>
          <section className="animate-up">
            <h2 className="mb-2 text-sm font-extrabold text-slate-500">② 要發什麼工具？</h2>
            <ItemPicker
              options={options}
              picked={picked}
              onChange={setPicked}
              tone="sky"
              availableLabel="公庫剩"
            />
          </section>

          <section className="animate-up">
            <h2 className="mb-2 text-sm font-extrabold text-slate-500">③ 備註（可略）</h2>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="例如：開學打掃用具發放"
              className="field"
            />
          </section>
        </>
      ) : null}

      {lines.length > 0 ? (
        <div className="fixed inset-x-0 bottom-[4.75rem] z-30 px-4 pb-safe">
          <button className="btn-sky w-full animate-up shadow-pop" disabled={busy} onClick={submit}>
            {busy ? "送出中…" : `發放給 ${target.name}｜${lines.length} 項 ${totalQty} 件`}
          </button>
        </div>
      ) : null}

      <AddClassSheet
        open={adding}
        onClose={() => setAdding(false)}
        onCreated={async (row) => {
          await reload();
          setToClass(row.id);
        }}
        toast={toast}
      />
    </div>
  );
}
