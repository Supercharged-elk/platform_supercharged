"use client";
import { CheckCircle2, Loader2, Circle, XCircle } from "lucide-react";

export interface VideoProgress {
  id: string;
  status: "idle" | "generating" | "done" | "error";
  error?: string;
}

interface JobProgressBarProps {
  items: VideoProgress[];
  accentColor?: "indigo" | "violet";
}

export function JobProgressBar({ items, accentColor = "indigo" }: JobProgressBarProps) {
  const total = items.length;
  const doneCount = items.filter((i) => i.status === "done").length;
  const anyActive = items.some((i) => i.status !== "idle");
  const anyGenerating = items.some((i) => i.status === "generating");
  const allDone = doneCount === total && total > 0;

  if (!anyActive) return null;

  const progress = total > 0 ? (doneCount / total) * 100 : 0;

  const barColor = accentColor === "violet" ? "bg-violet-500" : "bg-indigo-500";
  const trackColor = accentColor === "violet" ? "bg-violet-950/40" : "bg-indigo-950/40";
  const borderColor = accentColor === "violet" ? "border-violet-900/40" : "border-indigo-900/40";

  return (
    <div className={`rounded-xl border bg-neutral-900 p-4 space-y-3 ${allDone ? "border-emerald-900/50 bg-emerald-950/20" : borderColor}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-white">
          {allDone
            ? `${total} video${total !== 1 ? "s" : ""} ready`
            : anyGenerating
            ? "Generating your videos…"
            : `${doneCount} of ${total} complete`}
        </p>
        <span className="text-xs text-neutral-500 tabular-nums">{doneCount} / {total}</span>
      </div>

      {/* Progress bar */}
      <div className={`h-1.5 rounded-full ${trackColor}`}>
        <div
          className={`h-full rounded-full transition-all duration-700 ${allDone ? "bg-emerald-500" : barColor}`}
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Per-video status */}
      <div className="space-y-1.5">
        {items.map((item, i) => (
          <div key={item.id} className="flex items-center gap-2 text-xs">
            <span className="shrink-0">
              {item.status === "done" && <CheckCircle2 size={13} className="text-emerald-400" />}
              {item.status === "generating" && <Loader2 size={13} className="text-amber-400 animate-spin" />}
              {item.status === "idle" && <Circle size={13} className="text-neutral-600" />}
              {item.status === "error" && <XCircle size={13} className="text-red-400" />}
            </span>
            <span className={
              item.status === "done" ? "text-neutral-400" :
              item.status === "generating" ? "text-white font-medium" :
              item.status === "error" ? "text-red-400" :
              "text-neutral-600"
            }>
              {item.status === "done" && `Video ${i + 1} — done`}
              {item.status === "generating" && `Video ${i + 1} — animating…`}
              {item.status === "idle" && `Video ${i + 1} — queued`}
              {item.status === "error" && `Video ${i + 1} — failed`}
            </span>
          </div>
        ))}
      </div>

      {anyGenerating && (
        <p className="text-xs text-neutral-500">This may take up to 3 minutes per video.</p>
      )}
    </div>
  );
}
