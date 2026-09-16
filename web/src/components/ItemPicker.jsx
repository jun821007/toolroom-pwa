import { useState } from "react";
import Stepper from "./Stepper";

/**
 * 品項多選 + 數量。
 * options: [{ id, name, unit, available }]
 * picked:  { [itemId]: qty }
 */
export default function ItemPicker({ options, picked, onChange, tone = "sky", availableLabel }) {
  const [keyword, setKeyword] = useState("");

  const kw = keyword.trim();
  const visible = kw ? options.filter((o) => o.name.includes(kw)) : options;

  const toggle = (opt) => {
    const next = { ...picked };
    if (next[opt.id]) delete next[opt.id];
    else next[opt.id] = 1;
    onChange(next);
  };

  const setQty = (id, qty) => onChange({ ...picked, [id]: qty });

  if (options.length === 0) {
    return (
      <p className="rounded-2xl border-2 border-dashed border-slate-200 px-4 py-10 text-center text-sm font-bold text-slate-400">
        目前沒有可選的工具
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <input
        value={keyword}
        onChange={(e) => setKeyword(e.target.value)}
        placeholder="搜尋工具…"
        className="field"
      />

      {visible.map((opt) => {
        const qty = picked[opt.id];
        const active = Boolean(qty);

        return (
          <div
            key={opt.id}
            className={`rounded-2xl border-2 transition ${
              active ? "border-mint-400 bg-mint-50" : "border-slate-100 bg-white"
            }`}
          >
            <button
              type="button"
              onClick={() => toggle(opt)}
              className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
            >
              <span className="min-w-0">
                <span className="block truncate text-base font-bold text-slate-800">
                  {opt.name}
                </span>
                <span className="text-xs font-bold text-slate-400">
                  {availableLabel} {opt.available} {opt.unit}
                </span>
              </span>

              <span
                className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-extrabold ${
                  active ? "bg-mint-500 text-white" : "bg-slate-100 text-slate-400"
                }`}
              >
                {active ? "✓" : "＋"}
              </span>
            </button>

            {active ? (
              <div className="flex items-center justify-between border-t border-mint-200 px-4 py-2.5">
                <span className="text-xs font-bold text-slate-500">
                  剩餘 {opt.available - qty} {opt.unit}
                </span>
                <Stepper
                  value={qty}
                  max={opt.available}
                  tone={tone}
                  onChange={(v) => setQty(opt.id, v)}
                />
              </div>
            ) : null}
          </div>
        );
      })}

      {visible.length === 0 ? (
        <p className="py-6 text-center text-sm font-bold text-slate-400">找不到「{kw}」</p>
      ) : null}
    </div>
  );
}
