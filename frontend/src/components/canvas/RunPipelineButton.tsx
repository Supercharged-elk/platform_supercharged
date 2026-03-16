"use client";

import { useState } from "react";
import { useCanvasStore } from "@/store/canvas";
import { useAuthStore } from "@/store/auth";
import { cancelRun, executePipeline } from "@/lib/executor";
import { SignInToGenerateModal } from "@/components/auth/SignInToGenerateModal";
import { useSignInGate } from "@/hooks/useSignInGate";
import { Play, X } from "lucide-react";

export function RunPipelineButton() {
  const { nodes, edges, setNodeState, nodeStates } = useCanvasStore();
  const fetchCredits = useAuthStore((s) => s.fetchCredits);

  const executableTypes = new Set(["generateNode", "editNode", "videoNode", "multiRefNode"]);
  const hasNodes = nodes.some((n) => executableTypes.has(n.type || ""));
  const executableNodes = nodes.filter((n) => executableTypes.has(n.type || ""));
  const allComplete = executableNodes.length > 0 && executableNodes.every((n) => nodeStates[n.id]?.status === "complete");
  const hasCompleted = Object.values(nodeStates).some((s) => s.status === "complete");
  const { showGate, setShowGate, checkGate } = useSignInGate();
  const [running, setRunning] = useState(false);
  const [runId, setRunId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setError(null);

    if (checkGate()) return;

    // Guard: check canvas has executable nodes before starting
    const executableTypes = new Set(["generateNode", "editNode", "videoNode", "multiRefNode", "imageOutputNode", "videoOutputNode"]);
    const hasTargets = nodes.some((n) => executableTypes.has(n.type || ""));
    if (!hasTargets) {
      setError("Add a Generate, Edit, Animate, or Multi-Ref node first");
      setTimeout(() => setError(null), 3000);
      return;
    }

    const nextRunId = `pipeline_${Date.now()}`;
    setRunning(true);
    setRunId(nextRunId);

    try {
      await executePipeline(
        nodes as Parameters<typeof executePipeline>[0],
        edges,
        {
          onNodeStart: (nid) => setNodeState(nid, { status: "running", stage: "Starting...", runId: nextRunId }),
          onNodeProgress: (nid, pct, stage) => setNodeState(nid, { progress: pct, stage }),
          onNodeComplete: (nid, outputs) => {
            setNodeState(nid, { status: "complete", output: outputs.output, runId: nextRunId });
            void fetchCredits();
          },
          onNodeError: (nid, err) => setNodeState(nid, { status: "error", error: err, runId: nextRunId }),
        },
        { runId: nextRunId }
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      setTimeout(() => setError(null), 4000);
    } finally {
      setRunning(false);
      setRunId(null);
    }
  };

  const cancel = () => {
    if (runId) {
      cancelRun(runId);
    }
    setRunning(false);
    setRunId(null);
  };

  return (
    <div className="flex flex-col items-start">
      {showGate && <SignInToGenerateModal onClose={() => setShowGate(false)} />}
      {allComplete && !running && (
        <div className="absolute top-12 left-1/2 -translate-x-1/2 z-30 pointer-events-none">
          <div className="px-4 py-2 bg-green-900/90 border border-green-700 text-green-300 text-xs rounded-lg shadow-lg animate-pulse">
            ✓ Pipeline complete
          </div>
        </div>
      )}
      <button
        type="button"
        data-testid="run-pipeline"
        onClick={running ? cancel : run}
        className={`flex items-center gap-1.5 font-medium transition-all
          ${running
            ? "px-3 py-1.5 text-xs bg-neutral-700 hover:bg-neutral-600 text-neutral-300 rounded-lg border border-neutral-600"
            : hasNodes && !hasCompleted
              ? "px-4 py-2 text-sm bg-blue-600 hover:bg-blue-500 text-white rounded-xl border border-blue-500 shadow-lg shadow-blue-900/40 animate-pulse"
              : "px-3 py-1.5 text-xs bg-blue-700 hover:bg-blue-600 text-white rounded-lg border border-blue-600"
          }`}
      >
        {running ? <X size={13} /> : <Play size={13} />}
        {running ? "Cancel" : "Run Pipeline"}
      </button>
      {error && (
        <span className="text-[10px] text-red-400 mt-0.5 max-w-[180px] truncate">{error}</span>
      )}
    </div>
  );
}
