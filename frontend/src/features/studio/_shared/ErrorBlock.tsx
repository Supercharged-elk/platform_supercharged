import { AlertCircle } from "lucide-react";

interface ErrorBlockProps {
  message: string;
  onRetry?: () => void;
}

export function ErrorBlock({ message, onRetry }: ErrorBlockProps) {
  return (
    <div className="flex items-start gap-3 p-4 rounded-lg bg-red-950/40 border border-red-900/60">
      <AlertCircle size={16} className="text-red-400 mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-red-300 break-words">{message}</p>
      </div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="shrink-0 text-xs text-red-400 hover:text-red-200 underline transition"
        >
          Retry
        </button>
      )}
    </div>
  );
}
