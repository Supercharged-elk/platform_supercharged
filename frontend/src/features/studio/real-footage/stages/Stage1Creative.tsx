"use client";
import { useState, useCallback, useEffect, useMemo } from "react";
import { Film, Sparkles, ChevronRight, AlertTriangle, X, CheckCircle2, Loader2 } from "lucide-react";
import { useRealFootage } from "../hooks/useRealFootage";
import { ErrorBlock } from "../../_shared/ErrorBlock";
import {
  uploadToGemini,
  type GeminiFileRef,
  type GeminiUploadErrorCode,
  validateGeminiUploadFile,
} from "../../_shared/services/gemini";

interface UploadSlot {
  id: string;
  file: File;
  objectUrl: string; // for local <video> preview
  status: "uploading" | "processing" | "ready" | "error";
  progress: number; // 0-100
  error?: string;
  errorCode?: GeminiUploadErrorCode;
  ref?: GeminiFileRef;
}

function slotId() {
  return Math.random().toString(36).slice(2, 8);
}

export function Stage1Creative() {
  const { videoSources, creativeAnalysis, analyzeVideo, confirmAnalysis } = useRealFootage();

  const [slots, setSlots] = useState<UploadSlot[]>(() =>
    // Re-hydrate display from persisted sources (no File available after reload)
    videoSources.map((src) => ({
      id: slotId(),
      file: new File([], src.displayName),
      objectUrl: "",
      status: "ready" as const,
      progress: 100,
      ref: src,
    }))
  );

  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [expiredWarning, setExpiredWarning] = useState(false);
  // Defer file input rendering until after React hydration so event handlers are ready
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  // Check if persisted Gemini file refs have expired (48h limit)
  useEffect(() => {
    const FORTY_EIGHT_HOURS = 48 * 60 * 60 * 1000;
    const hasExpired = videoSources.some(
      (s) => s.uploadedAt && Date.now() - s.uploadedAt > FORTY_EIGHT_HOURS
    );
    if (hasExpired) {
      useRealFootage.getState().reset();
      setExpiredWarning(true);
    }
  }, []);

  const updateSlot = (id: string, patch: Partial<UploadSlot>) =>
    setSlots((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));

  const uploadFile = useCallback(
    async (file: File) => {
      const id = slotId();
      const objectUrl = URL.createObjectURL(file);

      setSlots((prev) => [
        ...prev,
        { id, file, objectUrl, status: "uploading", progress: 0 },
      ]);

      try {
        const ref = await uploadToGemini(file, (pct) =>
          updateSlot(id, { progress: pct, status: pct < 100 ? "uploading" : "processing" })
        );
        updateSlot(id, { status: "ready", progress: 100, ref });
      } catch (e) {
        const err = e as Error & { code?: GeminiUploadErrorCode };
        updateSlot(id, { status: "error", error: err.message, errorCode: err.code });
      }
    },
    []
  );

  const addFiles = (files: File[]) => {
    files.forEach((f) => {
      const preflight = validateGeminiUploadFile(f);
      if (!preflight.ok) {
        const id = slotId();
        const objectUrl = URL.createObjectURL(f);
        setSlots((prev) => [
          ...prev,
          {
            id,
            file: f,
            objectUrl,
            status: "error",
            progress: 0,
            error: preflight.error.message,
            errorCode: preflight.error.code,
          },
        ]);
        return;
      }
      void uploadFile(f);
    });
  };

  const removeSlot = (id: string) => {
    setSlots((prev) => {
      const slot = prev.find((s) => s.id === id);
      if (slot?.objectUrl) URL.revokeObjectURL(slot.objectUrl);
      return prev.filter((s) => s.id !== id);
    });
    // If we've already analysed, clear results — user needs to re-analyse
    if (creativeAnalysis) useRealFootage.getState().reset();
  };

  const retrySlot = (id: string) => {
    const slot = slots.find((s) => s.id === id);
    if (!slot || slot.file.size === 0) return; // rehydrated placeholder — can't retry
    removeSlot(id);
    void uploadFile(slot.file);
  };

  const removeFailedSlots = () => {
    setSlots((prev) => {
      prev
        .filter((s) => s.status === "error" && s.objectUrl)
        .forEach((s) => URL.revokeObjectURL(s.objectUrl));
      return prev.filter((s) => s.status !== "error");
    });
  };

  const handleAnalyze = async () => {
    const ready = slots.filter((s) => s.status === "ready" && s.ref);
    if (!ready.length) return;

    setAnalyzing(true);
    setAnalyzeError(null);
    try {
      await analyzeVideo(ready.map((s) => s.ref!));
    } catch (e) {
      setAnalyzeError((e as Error).message);
    } finally {
      setAnalyzing(false);
    }
  };

  const readyCount = slots.filter((s) => s.status === "ready").length;
  const hasErrors = slots.some((s) => s.status === "error");
  const uploading = slots.some((s) => s.status === "uploading" || s.status === "processing");
  const errorSummary = useMemo(() => {
    const failed = slots.filter((s) => s.status === "error");
    if (!failed.length) return null;

    const counts = new Map<string, number>();
    failed.forEach((s) => {
      const key = s.errorCode ?? s.error ?? "UPLOAD_FAILED";
      counts.set(key, (counts.get(key) ?? 0) + 1);
    });
    const [topReason] = Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0] ?? [];
    if (!topReason) return null;
    if (topReason === "FILE_TOO_LARGE") return "most clips exceed the allowed size";
    if (topReason === "UNSUPPORTED_MIME") return "the selected format is not supported";
    if (topReason === "MISSING_API_KEY") return "upload service is not configured";
    if (topReason === "UPLOAD_TIMEOUT") return "Gemini processing timed out";
    return "the upload service returned an error";
  }, [slots]);

  return (
    <div className="space-y-6">
      {expiredWarning && (
        <div className="flex items-start gap-2 px-4 py-3 rounded-xl bg-amber-950/90 border border-amber-700 text-sm text-amber-300">
          <AlertTriangle size={16} className="shrink-0 mt-0.5" />
          <span>Los videos subidos expiraron (Gemini los almacena 48hs). Subí los clips nuevamente.</span>
        </div>
      )}
      <div>
        <h2 className="text-lg font-semibold text-white flex items-center gap-2">
          <Film size={18} className="text-indigo-400" />
          Upload Real Footage
        </h2>
        <p className="text-sm text-neutral-400 mt-1">
          Upload one or more video clips. Gemini analyzes the actual video — motion, audio, timing —
          not just static frames.
        </p>
      </div>

      {/* Drop zone — always visible so user can keep adding */}
      <div
        className={[
          "relative flex flex-col items-center justify-center gap-3 p-8 rounded-xl border-2 border-dashed cursor-pointer transition-colors",
          uploading
            ? "border-indigo-500/50 bg-indigo-500/5 cursor-wait"
            : "border-neutral-700 bg-neutral-800/50 hover:border-neutral-500",
        ].join(" ")}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const files = Array.from(e.dataTransfer.files).filter((f) =>
            f.type.startsWith("video/")
          );
          if (files.length) addFiles(files);
        }}
      >
        <Film size={28} className="text-neutral-400 pointer-events-none" />
        <span className="text-sm text-neutral-400 text-center pointer-events-none">
          Click or drag & drop video files (MP4, MOV, WebM) — multiple allowed
        </span>
        {/* Render after hydration so React event handlers are attached when Playwright interacts */}
        {mounted && (
          <input
            type="file"
            accept="video/*"
            multiple
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            onChange={(e) => {
              const files = e.target.files ? Array.from(e.target.files) : [];
              addFiles(files);
              e.target.value = "";
            }}
          />
        )}
      </div>

      {/* Upload slots */}
      {slots.length > 0 && (
        <div className="space-y-2">
          {slots.map((slot) => (
            <div
              key={slot.id}
              className="flex items-center gap-3 px-3 py-3 rounded-xl bg-neutral-800 border border-neutral-700"
            >
              {/* Small video preview (only when File is available + has objectUrl) */}
              {slot.objectUrl ? (
                <video
                  src={slot.objectUrl}
                  className="w-20 h-12 rounded-lg object-cover bg-neutral-900 shrink-0"
                  muted
                  preload="metadata"
                />
              ) : (
                <div className="w-20 h-12 rounded-lg bg-neutral-900 flex items-center justify-center shrink-0">
                  <Film size={16} className="text-neutral-600" />
                </div>
              )}

              {/* Name + progress */}
              <div className="flex-1 min-w-0 space-y-1">
                <p className="text-xs text-neutral-300 truncate">{slot.file.name || slot.ref?.displayName}</p>

                {(slot.status === "uploading" || slot.status === "processing") && (
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1 bg-neutral-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-indigo-500 transition-all duration-300"
                        style={{ width: `${slot.progress}%` }}
                      />
                    </div>
                    <span className="text-[10px] text-neutral-500 shrink-0">
                      {slot.status === "uploading" ? "Uploading…" : "Processing…"}
                    </span>
                  </div>
                )}

                {slot.status === "ready" && (
                  <p className="text-[10px] text-emerald-400 flex items-center gap-1">
                    <CheckCircle2 size={10} />
                    Ready for analysis
                  </p>
                )}

                {slot.status === "error" && (
                  <div className="flex items-center gap-2">
                    <p className="text-xs text-red-400 break-all leading-snug flex-1">{slot.error ?? "Upload failed"}</p>
                    {slot.file.size > 0 && (
                      <button
                        type="button"
                        onClick={() => retrySlot(slot.id)}
                        className="text-[10px] text-neutral-400 hover:text-white underline shrink-0 transition"
                      >
                        Retry
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Remove */}
              <button
                type="button"
                onClick={() => removeSlot(slot.id)}
                className="text-neutral-600 hover:text-red-400 transition shrink-0"
                title="Remove"
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Analyze button — shown as soon as files are in the UI, no previous analysis */}
      {slots.length > 0 && !creativeAnalysis && (
        <div className="flex items-center gap-3 flex-wrap">
          {hasErrors && readyCount > 0 && (
            <p className="text-xs text-yellow-500">Some uploads failed — only ready clips will be analyzed.</p>
          )}
          {hasErrors && readyCount === 0 && !uploading && (
            <div className="flex items-center gap-2">
              <p className="text-xs text-red-400">
                All uploads failed{errorSummary ? ` — ${errorSummary}` : ""}. Remove the clips and try again.
              </p>
              <button
                type="button"
                onClick={removeFailedSlots}
                className="text-[10px] text-neutral-400 hover:text-white underline shrink-0 transition"
              >
                Remove failed clips
              </button>
            </div>
          )}
          <button
            type="button"
            onClick={() => void handleAnalyze()}
            disabled={analyzing || uploading || readyCount === 0}
            className="flex items-center gap-2 px-5 py-2 text-sm rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition disabled:opacity-50"
          >
            {analyzing ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Analyzing with Gemini…
              </>
            ) : uploading ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Waiting for uploads…
              </>
            ) : (
              <>
                <Sparkles size={14} />
                {readyCount > 0
                  ? `Analyze ${readyCount} clip${readyCount !== 1 ? "s" : ""} with Gemini`
                  : "Analyze with Gemini"}
              </>
            )}
          </button>
        </div>
      )}

      {analyzeError && (
        <ErrorBlock message={analyzeError} onRetry={() => void handleAnalyze()} />
      )}

      {/* Creative analysis result — shown when Gemini analysis completed */}
      {creativeAnalysis && !analyzing && (
        <div className="p-4 rounded-xl bg-neutral-800 border border-neutral-700">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Sparkles size={14} className="text-indigo-400" />
              <span className="text-xs font-medium text-neutral-300 uppercase tracking-wider">
                Creative Analysis
              </span>
            </div>
            <button
              type="button"
              onClick={() => void handleAnalyze()}
              className="text-[10px] text-neutral-500 hover:text-neutral-300 underline transition"
            >
              Re-analyze
            </button>
          </div>
          <p className="text-sm text-neutral-300 whitespace-pre-line leading-relaxed">
            {creativeAnalysis}
          </p>
        </div>
      )}

      {/* Navigation — visible as soon as the user has added any file */}
      {(slots.length > 0 || !!creativeAnalysis) && !analyzing && (
        <div className="flex items-center gap-3 flex-wrap">
          {creativeAnalysis && (
            <button
              type="button"
              onClick={() => {
                setSlots([]);
                setAnalyzeError(null);
                useRealFootage.getState().reset();
              }}
              className="px-4 py-2 text-sm rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 transition"
            >
              Start Over
            </button>
          )}
          <button
            type="button"
            onClick={confirmAnalysis}
            disabled={uploading}
            className="flex items-center gap-2 px-5 py-2 text-sm rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition disabled:opacity-50"
          >
            {creativeAnalysis ? "Confirm & Review Actions" : "Continue to Stage 2"}
            <ChevronRight size={15} />
          </button>
        </div>
      )}
    </div>
  );
}
