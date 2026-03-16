"use client";
import { useState } from "react";
import { Palette, RefreshCw, Trash2, Check, ChevronRight, AlertTriangle } from "lucide-react";
import { useIllustrations } from "../hooks/useIllustrations";
import { ImageUploader } from "../../_shared/ImageUploader";
import { GeneratingState } from "../../_shared/GeneratingState";
import { ErrorBlock } from "../../_shared/ErrorBlock";
import { base64ToDataUrl } from "../../_shared/utils";

export function Stage1Colorize() {
  const {
    colorized,
    addSketches,
    colorizeItem,
    colorizeAll,
    toggleApproved,
    removeItem,
    confirmColorized,
  } = useIllustrations();

  const [colorInstruction, setColorInstruction] = useState("");
  // Track what instruction was used when items became done
  const [appliedInstruction, setAppliedInstruction] = useState("");

  const approvedDone = colorized.filter((c) => c.approved && c.status === "done");
  const anyGenerating = colorized.some((c) => c.status === "generating");
  const anyDone = colorized.some((c) => c.status === "done");

  // Show warning when instruction changes after some items are done
  const instructionChanged = anyDone && colorInstruction !== appliedInstruction;

  const handleColorizeAll = async () => {
    setAppliedInstruction(colorInstruction);
    await colorizeAll(colorInstruction);
  };

  const handleColorizeItem = async (id: string) => {
    setAppliedInstruction(colorInstruction);
    await colorizeItem(id, colorInstruction);
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
            Upload your sketches below. Gemini AI will colorize each one with vibrant colors.
          </p>
        </div>
      </div>

      <ImageUploader
        label="Drop B&W sketch images here (JPG, PNG, WebP) — multiple allowed"
        accept="image/*"
        multiple
        onFiles={(files) => void addSketches(files)}
      />

      {/* Colorization instruction field */}
      {colorized.length > 0 && (
        <div className="space-y-1.5">
          <label className="text-xs text-neutral-400 font-medium">
            Colorization instructions (optional)
          </label>
          <input
            type="text"
            value={colorInstruction}
            onChange={(e) => setColorInstruction(e.target.value)}
            placeholder="e.g. warm earthy tones, winter palette with blues and greys, vibrant saturated colors…"
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

      {colorized.length > 0 && (
        <div className="space-y-4">
          {colorized.map((item) => (
            <div
              key={item.id}
              className={[
                "rounded-xl border overflow-hidden transition",
                item.approved && item.status === "done"
                  ? "border-violet-600/50"
                  : "border-neutral-700",
              ].join(" ")}
            >
              <div className="grid grid-cols-2 gap-0">
                {/* Original */}
                <div className="bg-neutral-900 p-2">
                  <p className="text-xs text-neutral-500 mb-1.5 px-1">Original</p>
                  <img
                    src={base64ToDataUrl(item.originalBase64, "image/jpeg")}
                    alt="Original sketch"
                    className="w-full rounded-lg object-contain max-h-48 bg-white"
                  />
                </div>

                {/* Colorized */}
                <div className="bg-neutral-900 p-2 border-l border-neutral-800">
                  <p className="text-xs text-neutral-500 mb-1.5 px-1">Colorized</p>
                  <div className="w-full rounded-lg max-h-48 flex items-center justify-center bg-neutral-800 overflow-hidden" style={{ minHeight: "96px" }}>
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
                        onClick={() => void handleColorizeItem(item.id)}
                        className="text-xs text-neutral-400 hover:text-violet-300 transition"
                      >
                        Click to colorize
                      </button>
                    )}
                    {item.status === "error" && (
                      <div className="p-2 w-full">
                        <ErrorBlock
                          message={item.error ?? "Failed"}
                          onRetry={() => void handleColorizeItem(item.id)}
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Action row */}
              <div className="flex items-center gap-2 px-3 py-2 bg-neutral-900 border-t border-neutral-800">
                <button
                  type="button"
                  onClick={() => toggleApproved(item.id)}
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
                  <button
                    type="button"
                    onClick={() => void handleColorizeItem(item.id)}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs text-neutral-400 hover:text-white bg-neutral-800 hover:bg-neutral-700 transition"
                  >
                    <RefreshCw size={11} />
                    Regenerate
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => removeItem(item.id)}
                  className="ml-auto flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs text-neutral-500 hover:text-red-400 bg-neutral-800 hover:bg-red-950/30 transition"
                >
                  <Trash2 size={11} />
                  Remove
                </button>
              </div>
            </div>
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
