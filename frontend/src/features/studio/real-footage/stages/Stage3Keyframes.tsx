"use client";
import { RefreshCw, ImageIcon, ChevronRight, Sparkles, Check, ArrowLeft } from "lucide-react";
import { useRealFootage } from "../hooks/useRealFootage";
import { GeneratingState } from "../../_shared/GeneratingState";
import { ErrorBlock } from "../../_shared/ErrorBlock";
import { base64ToDataUrl } from "../../_shared/utils";

export function Stage3Keyframes() {
  const {
    keyframes,
    setKeyframePrompt,
    generateKeyframe,
    generateAllKeyframes,
    toggleKeyframeApproved,
    confirmKeyframes,
    goBack,
  } = useRealFootage();

  const doneCount = keyframes.filter((k) => k.status === "done").length;
  const approvedDoneCount = keyframes.filter((k) => k.status === "done" && k.approved).length;
  const generatingCount = keyframes.filter((k) => k.status === "generating").length;
  const anyGenerating = generatingCount > 0;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <ImageIcon size={18} className="text-indigo-400" />
            Generate Keyframes
          </h2>
          <p className="text-sm text-neutral-400 mt-1">
            Edit each prompt, generate keyframe images, then approve the ones you want to animate.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void generateAllKeyframes()}
          disabled={anyGenerating}
          className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition disabled:opacity-50"
        >
          <Sparkles size={14} />
          Generate All
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {keyframes.map((kf) => (
          <div
            key={kf.id}
            className={[
              "rounded-xl border overflow-hidden transition",
              kf.status === "done" && kf.approved
                ? "border-emerald-600/60 bg-neutral-800"
                : kf.status === "done"
                ? "border-neutral-600 bg-neutral-800"
                : "border-neutral-700 bg-neutral-800",
            ].join(" ")}
          >
            {/* Image area */}
            <div className="aspect-video bg-neutral-900 flex items-center justify-center relative">
              {kf.status === "generating" && (
                <GeneratingState message="Generating keyframe…" />
              )}
              {kf.status === "done" && kf.base64 && (
                <img
                  src={base64ToDataUrl(kf.base64, kf.mimeType)}
                  alt="Keyframe"
                  className="w-full h-full object-cover"
                />
              )}
              {kf.status === "idle" && (
                <div className="flex flex-col items-center gap-2 text-neutral-600">
                  <ImageIcon size={32} />
                  <span className="text-xs">Not generated yet</span>
                </div>
              )}
              {kf.status === "error" && (
                <div className="p-3 w-full">
                  <ErrorBlock
                    message={kf.error ?? "Generation failed"}
                    onRetry={() => void generateKeyframe(kf.id)}
                  />
                </div>
              )}

              {/* Regenerate button overlay */}
              {kf.status === "done" && (
                <button
                  type="button"
                  onClick={() => void generateKeyframe(kf.id)}
                  className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/60 hover:bg-black/80 text-white transition"
                  title="Regenerate"
                >
                  <RefreshCw size={13} />
                </button>
              )}
            </div>

            {/* Prompt editor */}
            <div className="p-3 space-y-2">
              <textarea
                value={kf.prompt}
                onChange={(e) => setKeyframePrompt(kf.id, e.target.value)}
                className="w-full text-xs bg-neutral-900 border border-neutral-700 rounded-lg p-2 text-neutral-300 resize-none focus:outline-none focus:border-indigo-500 nodrag nowheel"
                rows={3}
                placeholder="Describe the keyframe…"
              />

              <div className="flex items-center gap-2">
                {kf.status !== "generating" && kf.status !== "done" && (
                  <button
                    type="button"
                    onClick={() => void generateKeyframe(kf.id)}
                    className="flex-1 py-1.5 text-xs rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition"
                  >
                    Generate
                  </button>
                )}

                {/* Approve toggle — always shown, disabled until done */}
                <button
                  type="button"
                  onClick={() => toggleKeyframeApproved(kf.id)}
                  disabled={kf.status !== "done"}
                  title={kf.status !== "done" ? "Generate keyframe first" : kf.approved ? "Unapprove" : "Approve for animation"}
                  className={[
                    "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition",
                    kf.status === "done" && kf.approved
                      ? "bg-emerald-600 text-white"
                      : kf.status === "done"
                      ? "bg-neutral-700 text-neutral-400 hover:bg-neutral-600 hover:text-neutral-200"
                      : "bg-neutral-800 text-neutral-600 cursor-not-allowed opacity-50",
                  ].join(" ")}
                >
                  <Check size={11} strokeWidth={kf.approved ? 3 : 2} />
                  {kf.approved && kf.status === "done" ? "Approved" : "Approve"}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Continue / empty state */}
      {doneCount > 0 && !anyGenerating && (
        <div>
          {approvedDoneCount === 0 ? (
            <p className="text-sm text-neutral-500 italic">
              Approve at least one keyframe to continue.
            </p>
          ) : (
            <button
              type="button"
              onClick={confirmKeyframes}
              className="flex items-center gap-2 px-5 py-2 text-sm rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium transition"
            >
              Animate {approvedDoneCount} Keyframe{approvedDoneCount !== 1 ? "s" : ""}
              <ChevronRight size={15} />
            </button>
          )}
        </div>
      )}

      {/* Bottom navigation */}
      <div className="flex items-center justify-between pt-2">
        <div className="space-y-1">
          <button
            type="button"
            onClick={goBack}
            className="flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-300 transition"
          >
            <ArrowLeft size={14} />
            Back to Actions
          </button>
          <p className="text-xs text-neutral-600">
            Going back and re-confirming actions will clear generated keyframes.
          </p>
        </div>
      </div>
    </div>
  );
}
