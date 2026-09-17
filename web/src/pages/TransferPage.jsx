import { useMemo, useState } from "react";
import ClassPicker from "../components/ClassPicker";
import ItemPicker from "../components/ItemPicker";
import { api } from "../api";

/** A 班 ➔ B 班批量調貨 */
export default function TransferPage({ classes, items, stock, reload, toast }) {
  const [fromClass, setFromClass] = useState(null);
  const [toClass, setToClass] = useState(null);
  const [picked, setPicked] = useState({});
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const itemById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);

  /** 只能調來源班級真的持有的東西 */
  const options = useMemo(() => {
    if (!fromClass) return [];
    return stock
      .filter((s) => s.class_id === fromClass && s.qty > 0)
      .map((s) => {
        const item = itemById.get(s.item_id);
        return item ? { id: item.id, name: item.name, unit: item.unit, available: s.qty } : null;
      })
      .filter(Boolean)
      .sort((a, b) => a.name.localeCompare(b.name, "zh-Hant"));
  }, [fromClass, stock, itemById]);

  const lines = Object.entries(picked).map(([id, qty]) => ({ item_id: Number(id), qty }));
  const totalQty = lines.reduce((s, l) => s + l.qty, 0);
  const src = classes.find((c) => c.id === fromClass);
  const dst = classes.find((c) => c.id === toClass);

  /** 換來源班級時，先前挑的品項可能不在新班級名下，一律清空 */
  const changeFrom = (id) => {
    setFromClass(id);
    setPicked({});
    if (toClass === id) setToClass(null);
  };

  const submit = async () => {
    setBusy(true);
    try {
      await api.transfer({
        from_class_id: fromClass,
        to_class_id: toClass,
        items: lines,
        note,
      });
      setPicked({});
      setNote("");
      await reload();
      toast({ ok: true, msg: `${src.name} ➔ ${dst.name} 已調撥 ${totalQty} 件` });
    } catch (err) {
      toast({ ok: false, msg: err.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4 pb-28">
      <section>
        <h2 className="mb-2 text-sm font-extrabold text-slate-500">① 從哪一班調出？</h2>
        <ClassPicker classes={classes} value={fromClass} onChange={changeFrom} tone="zest" />
      </section>

      {fromClass ? (
        <section className="animate-up">
          <h2 className="mb-2 text-sm font-extrabold text-slate-500">② 調給哪一班？</h2>
          <ClassPicker
            classes={classes}
            value={toClass}
            onChange={setToClass}
            disabledId={fromClass}
            tone="mint"
          />
        </section>
      ) : null}

      {fromClass && toClass ? (
        <>
          <section className="animate-up">
            <h2 className="mb-2 text-sm font-extrabold text-slate-500">
              ③ 要調什麼？（只列出 {src.name} 名下有的）
            </h2>
            <ItemPicker
              options={options}
              picked={picked}
              onChange={setPicked}
              tone="zest"
              availableLabel="該班有"
            />
          </section>

          <section className="animate-up">
            <h2 className="mb-2 text-sm font-extrabold text-slate-500">④ 備註（可略）</h2>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="例如：打掃區域互換"
              className="field"
            />
          </section>
        </>
      ) : null}

      {lines.length > 0 ? (
        <div className="fixed inset-x-0 bottom-[4.75rem] z-30 px-4 pb-safe">
          <button className="btn-zest w-full animate-up shadow-pop" disabled={busy} onClick={submit}>
            {busy ? "送出中…" : `${src.name} ➔ ${dst.name}｜${totalQty} 件`}
          </button>
        </div>
      ) : null}
    </div>
  );
}
