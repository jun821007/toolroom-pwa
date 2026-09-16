/** 班級選擇：大色塊按鈕，單手點得到 */
export default function ClassPicker({ classes, value, onChange, disabledId, tone = "sky" }) {
  const tones = {
    sky: "bg-sky2-500 border-sky2-500",
    zest: "bg-zest-500 border-zest-500",
    mint: "bg-mint-500 border-mint-500",
  };

  return (
    <div className="grid grid-cols-2 gap-2">
      {classes.map((c) => {
        const active = value === c.id;
        const disabled = disabledId === c.id;

        return (
          <button
            key={c.id}
            type="button"
            disabled={disabled}
            onClick={() => onChange(active ? null : c.id)}
            className={`min-h-[3rem] rounded-2xl border-2 px-3 py-2 text-sm font-bold transition active:scale-[0.97]
              ${
                active
                  ? `${tones[tone]} text-white shadow-card`
                  : "border-slate-200 bg-white text-slate-600"
              }
              ${disabled ? "opacity-30" : ""}`}
          >
            {c.name}
          </button>
        );
      })}
    </div>
  );
}
