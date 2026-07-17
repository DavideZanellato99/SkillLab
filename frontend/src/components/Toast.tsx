interface ToastProps {
  title: string;
  message: string;
  type: 'success' | 'error';
  onClose: () => void;
}

export default function Toast({ title, message, type, onClose }: ToastProps) {
  return (
    <div
      className="flex min-w-[300px] max-w-[420px] animate-toast-in items-center gap-4 rounded-2xl border border-white/6 bg-gray-900/95 px-6 py-4 shadow-[0_8px_32px_rgba(0,0,0,0.5)] backdrop-blur-xl max-md:min-w-0 max-md:max-w-none"
      role="alert"
    >
      <div
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
          type === 'success' ? 'bg-emerald-500/15 text-emerald-500' : 'bg-red-500/15 text-red-500'
        }`}
      >
        {type === 'success' ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="15" y1="9" x2="9" y2="15" />
            <line x1="9" y1="9" x2="15" y2="15" />
          </svg>
        )}
      </div>

      <div className="flex-1">
        <div className="mb-0.5 text-[0.85rem] font-semibold text-slate-100">{title}</div>
        <div className="text-xs text-slate-400">{message}</div>
      </div>

      <button
        className="cursor-pointer rounded-lg border-none bg-transparent p-1 text-slate-500 transition hover:bg-white/8 hover:text-slate-100"
        onClick={onClose}
        aria-label="Close notification"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  );
}
