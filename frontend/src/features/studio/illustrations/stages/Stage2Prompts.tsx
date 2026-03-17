"use client";
import { useRef, useState } from "react";
import {
  MessageSquare, Sparkles, Check, ChevronRight,
  ArrowLeft, Trash2, ImagePlus, Loader2, X,
} from "lucide-react";
import { useIllustrations } from "../hooks/useIllustrations";
import type { PromptItem } from "../types";
import { base64ToDataUrl, fileToBase64 } from "../../_shared/utils";

export function Stage2Prompts() {
  const {
    prompts,
    setAction,
    setPrompt,
    enrichPrompt,
    togglePromptApproved,
    setEndImage,
    removeEndImage,
    addExternalImages,
    removePromptItem,
    confirmPrompts,
    goBack,
  } = useIllustrations();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleEnrich = async (id: string) => {
    setErrors((e) => { const n = { ...e }; delete n[id]; return n; });
    try {
      await enrichPrompt(id);
    } catch (e) {
      setErrors((prev) => ({ ...prev, [id]: (e as Error).message }));
    }
  };

  const handleAddExternal = (files: FileList | null) => {
    if (!files?.length) return;
    void addExternalImages(Array.from(files));
  };

  const approvedCount = prompts.filter((p) => p.approved && p.prompt.trim()).length;
  const anyGenerating = prompts.some((p) => p.promptStatus === "generating");

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <MessageSquare size={18} className="text-violet-400" />
            Review Animation Prompts
          </h2>
          <p className="text-sm text-neutral-400 mt-1">
            Describe the action for each image and generate a prompt, or write one directly.
          </p>
        </div>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-neutral-700 hover:bg-neutral-600 text-neutral-200 transition"
        >
          <ImagePlus size={14} />
          Add Images
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => { handleAddExternal(e.target.files); e.target.value = ""; }}
        />
      </div>

      {prompts.length === 0 && (
        <div className="text-center py-12 text-neutral-500 text-sm">
          No images to animate. Go back to colorize some sketches, or add images above.
        </div>
      )}

      {/* Cards */}
      <div className="space-y-4">
        {prompts.map((item) => (
          <PromptCard
            key={item.id}
            item={item}
            error={errors[item.id]}
            onActionChange={(v) => setAction(item.id, v)}
            onPromptChange={(v) => setPrompt(item.id, v)}
            onEnrich={() => void handleEnrich(item.id)}
            onToggleApproved={() => togglePromptApproved(item.id)}
            onSetEndImage={(base64, mimeType) => setEndImage(item.id, base64, mimeType)}
            onRemoveEndImage={() => removeEndImage(item.id)}
            onRemove={() => removePromptItem(item.id)}
          />
        ))}
      </div>

      {/* Bottom navigation */}
      <div className="flex items-center justify-between flex-wrap gap-4 pt-2">
        <button
          type="button"
          onClick={goBack}
          className="flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-300 transition"
        >
          <ArrowLeft size={14} />
          Back to Colorize
        </button>

        {approvedCount > 0 && !anyGenerating && (
          <button
            type="button"
            onClick={confirmPrompts}
            className="flex items-center gap-2 px-5 py-2 text-sm rounded-lg bg-violet-600 hover:bg-violet-500 text-white font-medium transition"
          >
            Animate {approvedCount} Image{approvedCount !== 1 ? "s" : ""}
            <ChevronRight size={15} />
          </button>
        )}
      </div>
    </div>
  );
}

// ── Per-item card ─────────────────────────────────────────────────────────────

interface CardProps {
  item: PromptItem;
  error?: string;
  onActionChange: (v: string) => void;
  onPromptChange: (v: string) => void;
  onEnrich: () => void;
  onToggleApproved: () => void;
  onSetEndImage: (base64: string, mimeType: string) => void;
  onRemoveEndImage: () => void;
  onRemove: () => void;
}

function PromptCard({
  item,
  error,
  onActionChange,
  onPromptChange,
  onEnrich,
  onToggleApproved,
  onSetEndImage,
  onRemoveEndImage,
  onRemove,
}: CardProps) {
  const endImageInputRef = useRef<HTMLInputElement>(null);
  const isGenerating = item.promptStatus === "generating";

  const handleEndImageFile = async (file: File) => {
    const base64 = await fileToBase64(file);
    onSetEndImage(base64, file.type || "image/jpeg");
  };

  return (
    <div
      className={[
        "rounded-xl border overflow-hidden transition bg-neutral-800",
        item.approved && item.prompt.trim()
          ? "border-violet-600/50"
          : "border-neutral-700",
      ].join(" ")}
    >
      <div className="flex gap-0">
        {/* Thumbnail */}
        <div className="w-32 shrink-0 bg-neutral-900 relative">
          <img
            src={base64ToDataUrl(item.imageBase64, item.mimeType)}
            alt="Illustration"
            className="w-full h-full object-cover"
          />
          {/* Source badge */}
          <span
            className={[
              "absolute top-1.5 left-1.5 text-[10px] px-1.5 py-0.5 rounded font-medium",
              item.source === "external"
                ? "bg-amber-900/80 text-amber-300"
                : "bg-violet-900/80 text-violet-300",
            ].join(" ")}
          >
            {item.source === "external" ? "External" : "Colorized"}
          </span>
        </div>

        {/* Content */}
        <div className="flex-1 p-3 space-y-2 min-w-0">
          {/* Action row */}
          <div className="flex gap-2">
            <input
              id={`action-${item.id}`}
              name={`action-${item.id}`}
              type="text"
              value={item.action}
              onChange={(e) => onActionChange(e.target.value)}
              placeholder="Describe the action… e.g. bird flies through clouds"
              className="flex-1 min-w-0 text-xs bg-neutral-900 border border-neutral-700 rounded-lg px-2.5 py-1.5 text-neutral-200 placeholder:text-neutral-600 focus:outline-none focus:border-violet-500 nodrag nowheel"
            />
            <button
              type="button"
              onClick={onEnrich}
              disabled={isGenerating}
              title={item.action.trim() ? "Generate prompt from action" : "Auto-generate from image"}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-violet-700 hover:bg-violet-600 text-white transition disabled:opacity-50 shrink-0"
            >
              {isGenerating
                ? <Loader2 size={11} className="animate-spin" />
                : <Sparkles size={11} />}
              {isGenerating ? "Generating…" : "Generate"}
            </button>
          </div>

          {/* End image */}
          <div className="flex items-center gap-2">
            {item.endImageBase64 ? (
              <div className="flex items-center gap-2">
                <img
                  src={base64ToDataUrl(item.endImageBase64, item.endImageMimeType)}
                  alt="End frame"
                  className="h-8 w-12 object-cover rounded border border-neutral-600"
                />
                <span className="text-xs text-neutral-400">End frame</span>
                <button
                  type="button"
                  onClick={onRemoveEndImage}
                  className="p-0.5 rounded text-neutral-500 hover:text-red-400 transition"
                  title="Remove end frame"
                >
                  <X size={12} />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => endImageInputRef.current?.click()}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs text-neutral-400 hover:text-violet-300 bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 hover:border-violet-600 transition"
              >
                <ImagePlus size={12} />
                Add end frame
              </button>
            )}
            <input
              ref={endImageInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleEndImageFile(f);
                e.target.value = "";
              }}
            />
          </div>

          {/* Prompt textarea — always visible */}
          <textarea
            id={`prompt-${item.id}`}
            name={`prompt-${item.id}`}
            value={item.prompt}
            onChange={(e) => onPromptChange(e.target.value)}
            placeholder="Animation prompt (generated above or write directly)…"
            className="w-full text-xs bg-neutral-900 border border-neutral-700 rounded-lg p-2.5 text-neutral-200 placeholder:text-neutral-500 resize-none focus:outline-none focus:border-violet-500 nodrag nowheel"
            rows={3}
          />

          {error && (
            <p className="text-xs text-red-400">{error}</p>
          )}

          {/* Action row */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onToggleApproved}
              disabled={!item.prompt.trim()}
              title={!item.prompt.trim() ? "Add a prompt first" : ""}
              className={[
                "flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition",
                item.approved && item.prompt.trim()
                  ? "bg-violet-600 text-white"
                  : "bg-neutral-900 text-neutral-400 border border-neutral-700 hover:border-violet-500 disabled:opacity-40",
              ].join(" ")}
            >
              <Check size={11} />
              {item.approved && item.prompt.trim() ? "Approved" : "Approve"}
            </button>

            <button
              type="button"
              onClick={onRemove}
              className="ml-auto flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs text-neutral-500 hover:text-red-400 bg-neutral-900 hover:bg-red-950/30 transition"
            >
              <Trash2 size={11} />
              Remove
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
