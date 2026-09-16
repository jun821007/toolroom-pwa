/** 大按鈕數量調整器；拇指好按，也可直接鍵入數字 */
export default function Stepper({ value, max, onChange, tone = "sky" }) {
  const tones = {
    sky: "bg-sky2-100 text-sky2-700",
    zest: "bg-zest-100 text-zest-700",
    mint: "bg-mint-100 text-mint-700",
  };

  const clamp = (n) => Math.max(1, Math.min(Number.isFinite(n) ? n : 1, max ?? Infinity));

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => onChange(clamp(value - 1))}
        className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl text-xl font-extrabold active:scale-95 ${tones[tone]}`}
      >
        −
      </button>

      <input
        type="number"
        inputMode="numeric"
        value={value}
        onChange={(e) => onChange(clamp(parseInt(e.target.value, 10)))}
        className="h-11 w-16 rounded-xl border-2 border-slate-200 text-center text-lg font-extrabold outline-none focus:border-mint-400"
      />

      <button
        type="button"
        onClick={() => onChange(clamp(value + 1))}
        disabled={max !== undefined && value >= max}
        className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl text-xl font-extrabold active:scale-95 disabled:opacity-30 ${tones[tone]}`}
      >
        ＋
      </button>
    </div>
  );
}
