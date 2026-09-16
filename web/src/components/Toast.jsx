import { useEffect } from "react";

export default function Toast({ toast, onClose }) {
  useEffect(() => {
    if (!toast) return;
    // 錯誤訊息留久一點，讓人看清楚原因
    const timer = setTimeout(onClose, toast.ok ? 2600 : 5000);
    return () => clearTimeout(timer);
  }, [toast, onClose]);

  if (!toast) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex justify-center px-4">
      <button
        onClick={onClose}
        className={`pointer-events-auto flex max-w-sm animate-up items-start gap-2 rounded-2xl px-4 py-3
                    text-left text-sm font-bold text-white shadow-pop
                    ${toast.ok ? "bg-mint-500" : "bg-rose-500"}`}
      >
        <span className="text-base leading-tight">{toast.ok ? "✅" : "⚠️"}</span>
        <span className="leading-relaxed">{toast.msg}</span>
      </button>
    </div>
  );
}
