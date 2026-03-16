"use client";
import { useState } from "react";
import { Wand2, ChevronRight, Check, ArrowLeft, Sparkles, ImageIcon, Video } from "lucide-react";
import { useRealFootage } from "../hooks/useRealFootage";
import { GeneratingState } from "../../_shared/GeneratingState";
import { ErrorBlock } from "../../_shared/ErrorBlock";

export function Stage2Actions() {
  const {
    creativeAnalysis,
    actionsText,
    actions,
    setActionsText,
    setActionImagePrompt,
    setActionVideoPrompt,
    toggleActionApproved,
    enrichActions,
    confirmActions,
    goBack,
  } = useRealFootage();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const approvedCount = actions.filter((a) => a.approved).length;
  const actionLineCount = actionsText.split("\n").filter((l) => l.trim()).length;

  const handleEnrich = async () => {
    setLoading(true);
    setError(null);
    try {
      await enrichActions();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-white flex items-center gap-2">
          <Wand2 size={18} className="text-indigo-400" />
          Define & Enrich Actions
        </h2>
        <p className="text-sm text-neutral-400 mt-1">
          Enter your actions below, one per line. AI will generate an image prompt and a video
          prompt for each one, guided by the art direction from Stage 1.
        </p>
      </div>

      {/* Art direction recap (read-only) */}
      <div className="p-4 rounded-xl bg-neutral-800 border border-neutral-700">
        <div className="flex items-center gap-2 mb-2">
          <Sparkles size={13} className="text-indigo-400" />
          <span className="text-xs font-medium text-neutral-400 uppercase tracking-wider">
            Art Direction Brief
          </span>
        </div>
        <p className="text-sm text-neutral-300 whitespace-pre-line leading-relaxed">
          {creativeAnalysis}
        </p>
      </div>

      {/* Actions text input */}
      <div className="space-y-2">
        <label className="text-xs font-medium text-neutral-400 uppercase tracking-wider">
          Actions (one per line)
        </label>
        <textarea
          value={actionsText}
          onChange={(e) => setActionsText(e.target.value)}
          className="w-full text-sm bg-neutral-900 border border-neutral-700 rounded-xl p-3 text-neutral-200 resize-none focus:outline-none focus:border-indigo-500 nodrag nowheel"
          rows={6}
          placeholder="Close-up of hands shaping clay on a pottery wheel
Wide shot of morning light entering through tall windows
Slow pan across a city skyline at dusk"
        />
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <p className="text-xs text-neutral-600">
            {actionLineCount} action{actionLineCount !== 1 ? "s" : ""} detected
          </p>
          <button
            type="button"
            onClick={handleEnrich}
            disabled={loading || !actionsText.trim()}
            className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition disabled:opacity-50"
          >
            <Wand2 size={14} />
            Enrich with AI
          </button>
        </div>
      </div>

      {loading && (
        <GeneratingState
          message="Generating image & video prompts…"
          subMessage="GPT-4o is analyzing each action"
        />
      )}
      {error && <ErrorBlock message={error} onRetry={() => setError(null)} />}

      {/* Enriched action cards */}
      {!loading && actions.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <p className="text-xs font-medium text-neutral-400 uppercase tracking-wider">
              Enriched Actions — review & edit
            </p>
            {approvedCount > 0 && (
              <button
                type="button"
                onClick={confirmActions}
                className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition"
              >
                Generate Keyframes for {approvedCount} Action{approvedCount !== 1 ? "s" : ""}
                <ChevronRight size={15} />
              </button>
            )}
          </div>
          {actions.map((action) => (
            <div
              key={action.id}
              className={[
                "rounded-xl border transition",
                action.approved
                  ? "border-indigo-600/50 bg-indigo-950/20"
                  : "border-neutral-700 bg-neutral-800/50",
              ].join(" ")}
            >
              {/* Header: approve toggle + raw action */}
              <div className="flex items-start gap-3 p-4 pb-3">
                <button
                  type="button"
                  onClick={() => toggleActionApproved(action.id)}
                  className={[
                    "mt-0.5 shrink-0 w-5 h-5 rounded flex items-center justify-center border transition",
                    action.approved
                      ? "bg-indigo-600 border-indigo-500"
                      : "border-neutral-600 bg-neutral-800",
                  ].join(" ")}
                >
                  {action.approved && <Check size={11} className="text-white" strokeWidth={3} />}
                </button>
                <p className="text-sm text-neutral-300 leading-snug">{action.raw}</p>
              </div>

              {/* Image prompt */}
              <div className="px-4 pb-3 space-y-1">
                <div className="flex items-center gap-1.5">
                  <ImageIcon size={11} className="text-indigo-400" />
                  <span className="text-[10px] font-medium text-neutral-500 uppercase tracking-wider">
                    Image Prompt (Gemini)
                  </span>
                </div>
                <textarea
                  value={action.imagePrompt}
                  onChange={(e) => setActionImagePrompt(action.id, e.target.value)}
                  className="w-full text-xs bg-neutral-900 border border-neutral-700 rounded-lg p-2 text-neutral-300 resize-none focus:outline-none focus:border-indigo-500 nodrag nowheel"
                  rows={3}
                />
              </div>

              {/* Video prompt */}
              <div className="px-4 pb-4 space-y-1">
                <div className="flex items-center gap-1.5">
                  <Video size={11} className="text-violet-400" />
                  <span className="text-[10px] font-medium text-neutral-500 uppercase tracking-wider">
                    Video Prompt (Kling)
                  </span>
                </div>
                <textarea
                  value={action.videoPrompt}
                  onChange={(e) => setActionVideoPrompt(action.id, e.target.value)}
                  className="w-full text-xs bg-neutral-900 border border-neutral-700 rounded-lg p-2 text-neutral-300 resize-none focus:outline-none focus:border-violet-500 nodrag nowheel"
                  rows={2}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Bottom navigation */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <button
          type="button"
          onClick={goBack}
          className="flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-300 transition"
        >
          <ArrowLeft size={14} />
          Back to Analysis
        </button>

        {approvedCount > 0 && !loading && (
          <button
            type="button"
            onClick={confirmActions}
            className="flex items-center gap-2 px-5 py-2 text-sm rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition"
          >
            Generate Keyframes for {approvedCount} Action{approvedCount !== 1 ? "s" : ""}
            <ChevronRight size={15} />
          </button>
        )}
      </div>
    </div>
  );
}
