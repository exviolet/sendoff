import { useToastStore } from "../../store/toastStore";
import type { ToastType } from "../../store/toastStore";

const typeStyles: Record<ToastType, string> = {
  success: "bg-green-500/15 text-green-400 border-green-500/20",
  error: "bg-danger/15 text-danger border-danger/20",
  info: "bg-accent/15 text-accent border-accent/20",
};

export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);
  const removeToast = useToastStore((s) => s.removeToast);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-1.5 pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          onClick={() => removeToast(t.id)}
          className={`pointer-events-auto cursor-pointer px-4 py-2 rounded-md border text-[11px] backdrop-blur-sm shadow-lg animate-toast-in ${typeStyles[t.type]}`}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}
