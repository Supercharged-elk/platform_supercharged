"use client";
import { useState } from "react";
import { Wand2, ChevronRight, Check, ArrowLeft } from "lucide-react";
import { useRealFootage } from "../hooks/useRealFootage";
import { GeneratingState } from "../../_shared/GeneratingState";
import { ErrorBlock } from "../../_shared/ErrorBlock";

export function Stage2Actions() {
  const {
    actions,
    setActionEnriched,
    toggleActionApproved,
    enrichActions,
    confirmActions,
    goBack,
  } = useRealFootage();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const approvedCount = actions.filter((a) => a.approved).length;

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
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <Wand2 size={18} className="text-indigo-400" />
            Review & Enrich Actions
          </h2>
          <p className="text-sm text-neutral-400 mt-1">
            Edit or enrich each detected action with cinematic detail. Approve the ones you want to keyframe.
          </p>
        </div>
        <button
          type="button"
          onClick={handleEnrich}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-700 transition disabled:opacity-50"
        >
          <Wand2 size={14} />
          AI Enrich All
        </button>
      </div>

      {loading && <GeneratingState message="Enriching actions with cinematic detail…" />}
      {error && <ErrorBlock message={error} onRetry={() => setError(null)} />}

      {!loading && (
        <div className="space-y-3">
          {actions.map((action) => (
            <div
              key={action.id}
              className={[
                "p-4 rounded-xl border transition",
                action.approved
                  ? "border-indigo-600/50 bg-indigo-950/20"
                  : "border-neutral-700 bg-neutral-800/50",
              ].join(" ")}
            >
              <div className="flex items-start gap-3">
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

                <div className="flex-1 space-y-2">
                  {action.raw !== action.enriched && (
                    <div>
                      <p className="text-xs text-neutral-500 mb-1">Original detection</p>
                      <p className="text-sm text-neutral-400 italic">{action.raw}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-xs text-neutral-500 mb-1">
                      {action.raw !== action.enriched ? "Enriched (editable)" : "Action (editable)"}
                    </p>
                    <textarea
                      value={action.enriched}
                      onChange={(e) => setActionEnriched(action.id, e.target.value)}
                      className="w-full text-sm bg-neutral-900 border border-neutral-700 rounded-lg p-2 text-neutral-200 resize-none focus:outline-none focus:border-indigo-500 nodrag nowheel"
                      rows={2}
                    />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Bottom navigation row */}
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
