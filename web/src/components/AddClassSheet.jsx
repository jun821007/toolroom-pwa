import { useState } from "react";
import Sheet from "./Sheet";
import { api } from "../api";

/** 新增班級／地點（廁所等）共用面板 */
export default function AddClassSheet({ open, onClose, onCreated, toast }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  if (!open) return null;

  const submit = async () => {
    const clean = name.trim();
    if (!clean || busy) return;
    setBusy(true);
    try {
      const row = await api.createClass({ name: clean });
      setName("");
      onClose();
      await onCreated?.(row);
      toast?.({ ok: true, msg: `已新增「${row.name}」` });
    } catch (err) {
      toast?.({ ok: false, msg: err.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open
      title="新增班級／地點"
      onClose={onClose}
      footer={
        <button className="btn-mint w-full" disabled={busy || !name.trim()} onClick={submit}>
          {busy ? "處理中…" : "建立"}
        </button>
      }
    >
      <p className="mb-3 text-sm font-bold text-slate-500">
        班級、廁所、資源班都可以。名稱不能跟現有的重複。
      </p>
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        placeholder="例如：七年一班、後棟3F廁所"
        className="field text-center text-lg font-extrabold"
      />
    </Sheet>
  );
}
