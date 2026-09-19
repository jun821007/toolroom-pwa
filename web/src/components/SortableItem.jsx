import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

/** 可拖曳列：左側把手 + 右側內容；手機用 PointerSensor 長按拖 */
export function SortableItem({ id, children, className = "", handle = true }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 20 : undefined,
    opacity: isDragging ? 0.92 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className={`${className} ${isDragging ? "shadow-pop" : ""}`}>
      <div className="flex items-stretch gap-2">
        {handle ? (
          <button
            type="button"
            className="flex w-9 shrink-0 touch-none items-center justify-center rounded-xl bg-slate-100 text-lg font-bold text-slate-400 active:bg-slate-200"
            aria-label="拖曳排序"
            {...attributes}
            {...listeners}
          >
            ⋮⋮
          </button>
        ) : (
          <div className="touch-none" {...attributes} {...listeners}>
            {children}
          </div>
        )}
        {handle ? <div className="min-w-0 flex-1">{children}</div> : null}
      </div>
    </div>
  );
}

/** 陣列依 active→over 重排 */
export function arrayMove(list, from, to) {
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}
