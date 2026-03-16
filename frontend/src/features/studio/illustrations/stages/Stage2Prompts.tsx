"use client";
import { useState } from "react";
import { MessageSquare, RefreshCw, Check, ChevronRight, ArrowLeft } from "lucide-react";
import { useIllustrations } from "../hooks/useIllustrations";
import { ErrorBlock } from "../../_shared/ErrorBlock";
import { base64ToDataUrl } from "../../_shared/utils";

export function Stage2Prompts() {
  const { prompts, setPrompt, regeneratePrompt, confirmPrompts, goBack } = useIllustrations();
  const [regenerating, setRegenerating] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleRegenerate = async (id: string) => {
    setRegenerating((r) => ({ ...r, [id]: true }));
    setErrors((e) => { const n = { ...e }; delete n[id]; return n; });
    try {
      await regeneratePrompt(id);
    } catch (e) {
      setErrors((prev) => ({ ...prev, [id]: (e as Error).message }));
    } finally {
      setRegenerating((r) => ({ ...r, [id]: false }));
    }
  };

  const toggleApproved = (id: string) => {
    useIllustrations.setState((s) => ({
      prompts: s.prompts.map((p) =>
        p.id === id ? { ...p, approved: !p.approved } : p
      ),
    }));
  };

  const approvedCount = prompts.filter((p) => p.approved).length;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-white flex items-center gap-2">
          <MessageSquare size={18} className="text-violet-400" />
          Review Video Prompts
        </h2>
        <p className="text-sm text-neutral-400 mt-1">
          Each prompt will guide the video animation. Edit or regenerate as needed.
        </p>
      </div>

      <div className="space-y-4">
        {prompts.map((item) => (
          <div
            key={item.id}
            className="bg-neutral-800 rounded-xl border border-neutral-700 overflow-hidden"
          >
            <div className="flex gap-0">
              {/* Thumbnail */}
              <img
                src={base64ToDataUrl(item.imageBase64, item.mimeType)}
                alt="Colorized sketch"
                className="w-32 object-cover shrink-0 bg-neutral-900"
              />

              {/* Prompt area */}
              <div className="flex-1 p-4 space-y-3">
                <textarea
                  value={item.prompt}
                  onChange={(e) => setPrompt(item.id, e.target.value)}
                  className="w-full text-sm bg-neutral-900 border border-neutral-700 rounded-lg p-3 text-neutral-200 resize-none focus:outline-none focus:border-violet-500 nodrag nowheel"
                  rows={3}
                  placeholder="Describe the animation…"
                />

                {errors[item.id] && (
                  <ErrorBlock message={errors[item.id]} onRetry={() => void handleRegenerate(item.id)} />
                )}

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void handleRegenerate(item.id)}
                    disabled={regenerating[item.id]}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-neutral-400 hover:text-white bg-neutral-900 hover:bg-neutral-700 border border-neutral-700 transition disabled:opacity-50"
                  >
                    <RefreshCw size={11} className={regenerating[item.id] ? "animate-spin" : ""} />
                    {regenerating[item.id] ? "Regenerating…" : "Regenerate Prompt"}
                  </button>

                  <button
                    type="button"
                    onClick={() => toggleApproved(item.id)}
                    className={[
                      "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition ml-auto",
                      item.approved
                        ? "bg-violet-600 text-white"
                        : "bg-neutral-900 text-neutral-400 border border-neutral-700 hover:border-violet-500",
                    ].join(" ")}
                  >
                    <Check size={11} />
                    {item.approved ? "Approved" : "Approve"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Bottom navigation row */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <button
          type="button"
          onClick={goBack}
          className="flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-300 transition"
        >
          <ArrowLeft size={14} />
          Back to Colorize
        </button>

        {approvedCount > 0 && (
          <button
            type="button"
            onClick={confirmPrompts}
            className="flex items-center gap-2 px-5 py-2 text-sm rounded-lg bg-violet-600 hover:bg-violet-500 text-white font-medium transition"
          >
            Generate {approvedCount} Video{approvedCount !== 1 ? "s" : ""}
            <ChevronRight size={15} />
          </button>
        )}
      </div>
    </div>
  );
}
