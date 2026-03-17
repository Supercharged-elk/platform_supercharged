"use client";
import { useRef, useState } from "react";
import { Palette, RefreshCw, Trash2, Check, ChevronRight, AlertTriangle, ImagePlus, X, Download } from "lucide-react";
import { useIllustrations } from "../hooks/useIllustrations";
import type { ColorizedItem } from "../types";
import { ImageUploader } from "../../_shared/ImageUploader";
import { GeneratingState } from "../../_shared/GeneratingState";
import { ErrorBlock } from "../../_shared/ErrorBlock";
import { base64ToDataUrl, fileToBase64, downloadBase64, downloadAsZip } from "../../_shared/utils";

export function Stage1Colorize() {
  const {
    colorized,
    addSketches,
    setItemInstruction,
    setItemReference,
    removeItemReference,
    colorizeItem,
    colorizeAll,
    toggleApproved,
    removeItem,
    confirmColorized,
  } = useIllustrations();

  const [globalInstruction, setGlobalInstruction] = useState("");
  const [appliedInstruction, setAppliedInstruction] = useState("");

  const approvedDone = colorized.filter((c) => c.approved && c.status === "done");
  const doneItems = colorized.filter((c) => c.status === "done" && c.colorizedBase64);
  const anyGenerating = colorized.some((c) => c.status === "generating");
  const anyDone = colorized.some((c) => c.status === "done");

  const instructionChanged = anyDone && globalInstruction !== appliedInstruction;

  const handleColorizeAll = async () => {
    setAppliedInstruction(globalInstruction);
    await colorizeAll(globalInstruction);
  };

  const handleColorizeItem = async (id: string) => {
    const item = colorized.find((c) => c.id === id);
    const effective = item?.instruction || globalInstruction || undefined;
    await colorizeItem(id, effective);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <Palette size={18} className="text-violet-400" />
            Upload & Colorize Sketches
          </h2>
          <p className="text-sm text-neutral-400 mt-1">
            Upload your sketches below. Gemini AI will colorize each one. Add per-image instructions or a color reference.
          </p>
        </div>
        {doneItems.length > 0 && (
          <button
            type="button"
            onClick={() =>
              downloadAsZip(
                doneItems.map((c) => ({ base64: c.colorizedBase64!, mimeType: c.mimeType })),
                doneItems.map((_, i) => `colorized-${i + 1}.jpg`),
                "colorized.zip"
              ).catch(console.error)
            }
            className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-neutral-700 hover:bg-neutral-600 text-neutral-200 transition"
          >
            <Download size={14} />
            Download All ({doneItems.length})
          </button>
        )}
      </div>

      <ImageUploader
        label="Drop B&W sketch images here (JPG, PNG, WebP) — multiple allowed"
        accept="image/*"
        multiple
        onFiles={(files) => void addSketches(files)}
      />

      {/* Global colorization instruction */}
      {colorized.length > 0 && (
        <div className="space-y-1.5">
          <label className="text-xs text-neutral-400 font-medium">
            Global colorization instructions <span className="text-neutral-600">(optional — applies to all unless overridden per image)</span>
          </label>
          <input
            id="global-instruction"
            name="global-instruction"
            type="text"
            value={globalInstruction}
            onChange={(e) => setGlobalInstruction(e.target.value)}
            placeholder="e.g. warm earthy tones, winter palette with blues and greys…"
            className="w-full text-sm bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-neutral-200 placeholder:text-neutral-600 focus:outline-none focus:border-violet-500 nodrag nowheel"
          />
          {instructionChanged && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-950/40 border border-amber-900/60 text-xs text-amber-400">
              <AlertTriangle size={12} />
              Instructions changed. Regenerate sketches to apply new instructions.
            </div>
          )}
        </div>
      )}

      {/* Colorize All button */}
      {colorized.length > 0 && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => void handleColorizeAll()}
            disabled={anyGenerating}
            className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-violet-600 hover:bg-violet-500 text-white font-medium transition disabled:opacity-50"
          >
            <Palette size={14} />
            Colorize All
          </button>
        </div>
      )}

      {/* Item cards */}
      {colorized.length > 0 && (
        <div className="space-y-4">
          {colorized.map((item) => (
            <ColorizeCard
              key={item.id}
              item={item}
              onColorize={() => void handleColorizeItem(item.id)}
              onInstructionChange={(v) => setItemInstruction(item.id, v)}
              onReferenceChange={(base64, mimeType) => setItemReference(item.id, base64, mimeType)}
              onRemoveReference={() => removeItemReference(item.id)}
              onToggleApproved={() => toggleApproved(item.id)}
              onRemove={() => removeItem(item.id)}
            />
          ))}
        </div>
      )}

      {approvedDone.length > 0 && !anyGenerating && (
        <button
          type="button"
          onClick={confirmColorized}
          className="flex items-center gap-2 px-5 py-2 text-sm rounded-lg bg-violet-600 hover:bg-violet-500 text-white font-medium transition"
        >
          Generate Prompts for {approvedDone.length} Image{approvedDone.length !== 1 ? "s" : ""}
          <ChevronRight size={15} />
        </button>
      )}
    </div>
  );
}

// ── Per-item card ─────────────────────────────────────────────────────────────

interface CardProps {
  item: ColorizedItem;
  onColorize: () => void;
  onInstructionChange: (v: string) => void;
  onReferenceChange: (base64: string, mimeType: string) => void;
  onRemoveReference: () => void;
  onToggleApproved: () => void;
  onRemove: () => void;
}

function ColorizeCard({
  item,
  onColorize,
  onInstructionChange,
  onReferenceChange,
  onRemoveReference,
  onToggleApproved,
  onRemove,
}: CardProps) {
  const refInputRef = useRef<HTMLInputElement>(null);

  const handleReferenceFile = async (file: File) => {
    const base64 = await fileToBase64(file);
    onReferenceChange(base64, file.type || "image/jpeg");
  };

  return (
    <div
      className={[
        "rounded-xl border overflow-hidden transition",
        item.approved && item.status === "done"
          ? "border-violet-600/50"
          : "border-neutral-700",
      ].join(" ")}
    >
      {/* Before / After */}
      <div className="grid grid-cols-2 gap-0">
        {/* Original */}
        <div className="bg-neutral-900 p-2">
          <p className="text-xs text-neutral-500 mb-1.5 px-1">Original</p>
          <img
            src={base64ToDataUrl(item.originalBase64, item.originalMimeType ?? "image/jpeg")}
            alt="Original sketch"
            className="w-full rounded-lg object-contain max-h-48 bg-white"
          />
        </div>

        {/* Colorized */}
        <div className="bg-neutral-900 p-2 border-l border-neutral-800">
          <p className="text-xs text-neutral-500 mb-1.5 px-1">Colorized</p>
          <div
            className="w-full rounded-lg max-h-48 flex items-center justify-center bg-neutral-800 overflow-hidden"
            style={{ minHeight: "96px" }}
          >
            {item.status === "generating" && <GeneratingState message="Colorizing…" />}
            {item.status === "done" && item.colorizedBase64 && (
              <img
                src={base64ToDataUrl(item.colorizedBase64, item.mimeType)}
                alt="Colorized"
                className="w-full h-full object-contain"
              />
            )}
            {item.status === "idle" && (
              <button
                type="button"
                onClick={onColorize}
                className="text-xs text-neutral-400 hover:text-violet-300 transition"
              >
                Click to colorize
              </button>
            )}
            {item.status === "error" && (
              <div className="p-2 w-full">
                <ErrorBlock message={item.error ?? "Failed"} onRetry={onColorize} />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Per-item controls */}
      <div className="px-3 pt-3 pb-2 bg-neutral-900 border-t border-neutral-800 space-y-2">
        {/* Individual instruction */}
        <div className="flex gap-2 items-center">
          <input
            id={`instruction-${item.id}`}
            name={`instruction-${item.id}`}
            type="text"
            value={item.instruction}
            onChange={(e) => onInstructionChange(e.target.value)}
            placeholder="Per-image instruction (overrides global)…"
            className="flex-1 text-xs bg-neutral-800 border border-neutral-700 rounded-lg px-2.5 py-1.5 text-neutral-300 placeholder:text-neutral-600 focus:outline-none focus:border-violet-500 nodrag nowheel"
          />
        </div>

        {/* Color reference */}
        <div className="flex items-center gap-2">
          {item.referenceBase64 ? (
            <div className="flex items-center gap-2">
              <img
                src={base64ToDataUrl(item.referenceBase64, item.referenceMimeType)}
                alt="Color reference"
                className="h-8 w-12 object-cover rounded border border-neutral-600"
              />
              <span className="text-xs text-neutral-400">Color reference</span>
              <button
                type="button"
                onClick={onRemoveReference}
                className="p-0.5 rounded text-neutral-500 hover:text-red-400 transition"
                title="Remove reference"
              >
                <X size={12} />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => refInputRef.current?.click()}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs text-neutral-400 hover:text-violet-300 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 hover:border-violet-600 transition"
            >
              <ImagePlus size={12} />
              Add color reference
            </button>
          )}
          <input
            ref={refInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleReferenceFile(f);
              e.target.value = "";
            }}
          />
        </div>
      </div>

      {/* Action row */}
      <div className="flex items-center gap-2 px-3 py-2 bg-neutral-900 border-t border-neutral-800">
        <button
          type="button"
          onClick={onToggleApproved}
          disabled={item.status !== "done"}
          className={[
            "flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition",
            item.approved && item.status === "done"
              ? "bg-violet-600 text-white"
              : "bg-neutral-800 text-neutral-400 disabled:opacity-50",
          ].join(" ")}
        >
          <Check size={11} />
          {item.approved && item.status === "done" ? "Approved" : "Approve"}
        </button>

        {item.status === "done" && (
          <>
            <button
              type="button"
              onClick={onColorize}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs text-neutral-400 hover:text-white bg-neutral-800 hover:bg-neutral-700 transition"
            >
              <RefreshCw size={11} />
              Regenerate
            </button>
            <button
              type="button"
              onClick={() =>
                downloadBase64(
                  item.colorizedBase64!,
                  item.mimeType,
                  `colorized-${item.id}.jpg`
                ).catch(console.error)
              }
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs text-neutral-400 hover:text-white bg-neutral-800 hover:bg-neutral-700 transition"
              title="Download colorized image"
            >
              <Download size={11} />
              Download
            </button>
          </>
        )}

        <button
          type="button"
          onClick={onRemove}
          className="ml-auto flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs text-neutral-500 hover:text-red-400 bg-neutral-800 hover:bg-red-950/30 transition"
        >
          <Trash2 size={11} />
          Remove
        </button>
      </div>
    </div>
  );
}
