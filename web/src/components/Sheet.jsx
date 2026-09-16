import { useEffect } from "react";

/** 由下往上滑出的面板，行為接近 iOS 原生 sheet */
export default function Sheet({ open, title, onClose, children, footer }) {
  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-slate-900/40 backdrop-blur-sm">
      <button aria-label="關閉" className="absolute inset-0" onClick={onClose} />

      <div className="relative max-h-[88dvh] w-full animate-up overflow-hidden rounded-t-3xl bg-white shadow-pop">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="text-lg font-extrabold text-slate-800">{title}</h2>
          <button
            onClick={onClose}
            className="grid h-9 w-9 place-items-center rounded-full bg-slate-100 text-lg font-bold text-slate-500"
          >
            ✕
          </button>
        </div>

        <div className="max-h-[58dvh] overflow-y-auto px-5 py-4">{children}</div>

        {footer ? <div className="border-t border-slate-100 px-5 py-4 pb-safe">{footer}</div> : null}
      </div>
    </div>
  );
}
