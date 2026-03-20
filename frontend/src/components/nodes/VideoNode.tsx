"use client";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { useCanvasStore } from "@/store/canvas";
import { useAuthStore } from "@/store/auth";
import { SignInToGenerateModal } from "@/components/auth/SignInToGenerateModal";
import { useSignInGate } from "@/hooks/useSignInGate";
import { cancelRun, executeNode } from "@/lib/executor";
import { Film, X } from "lucide-react";

export function VideoNode({ id }: NodeProps) {
  const { nodes, edges, nodeStates, setNodeState } = useCanvasStore();
  const fetchCredits = useAuthStore((s) => s.fetchCredits);
  const { showGate, setShowGate, checkGate } = useSignInGate();
  const state = nodeStates[id] || { status: "idle", progress: 0, stage: "" };

  const run = async () => {
    if (checkGate()) return;
    const runId = `${id}_${Date.now()}`;
    setNodeState(id, { status: "running", progress: 0, stage: "Starting...", runId });
    await executeNode(id, nodes as Parameters<typeof executeNode>[1], edges, {
      onNodeStart: (nid) => setNodeState(nid, { status: "running" }),
      onNodeProgress: (nid, pct, stage) => setNodeState(nid, { progress: pct, stage }),
      onNodeComplete: (nid, outputs) => {
        setNodeState(nid, { status: "complete", output: outputs.output });
        void fetchCredits();
      },
      onNodeError: (nid, error) => setNodeState(nid, { status: "error", error }),
    }, {
      runId,
      getCachedOutput: (nodeId) => {
        if (nodeId === id) return undefined;
        const ns = nodeStates[nodeId];
        return (ns?.status === "complete" && ns.output !== undefined) ? ns.output : undefined;
      },
    });
  };

  const cancel = () => {
    if (typeof state.runId === "string") {
      cancelRun(state.runId);
    }
    setNodeState(id, { status: "error", error: "Run cancelled", stage: "Cancelled" });
  };

  return (
    <div className="bg-neutral-900 border border-neutral-700 rounded-xl p-3 w-56 relative">
      {showGate && <SignInToGenerateModal onClose={() => setShowGate(false)} />}
      <Handle type="target" position={Position.Left} id="image" title="image" className="!bg-blue-400 !w-3.5 !h-3.5" style={{ top: "32%" }} />
      <Handle type="target" position={Position.Left} id="prompt" title="prompt" className="!bg-yellow-500 !w-3.5 !h-3.5" style={{ top: "58%" }} />
      <Handle type="target" position={Position.Left} id="config" title="config" className="!bg-purple-400 !w-3.5 !h-3.5" style={{ top: "82%" }} />
      {/* Handle labels */}
      <span className="absolute text-[7px] text-blue-400 pointer-events-none select-none" style={{ left: 6, top: "calc(32% - 5px)" }}>img</span>
      <span className="absolute text-[7px] text-yellow-500 pointer-events-none select-none" style={{ left: 6, top: "calc(58% - 5px)" }}>txt</span>
      <span className="absolute text-[7px] text-purple-400 pointer-events-none select-none" style={{ left: 6, top: "calc(82% - 5px)" }}>cfg</span>

      <div className="text-xs font-semibold text-neutral-400 mb-2 uppercase tracking-wide">Animate</div>

      {state.status === "running" && (
        <div className="mb-2">
          <div className="w-full bg-neutral-800 rounded-full h-1.5">
            <div className="bg-orange-500 h-1.5 rounded-full" style={{ width: `${state.progress ?? 0}%`, transition: (state.progress ?? 0) > 0 ? 'width 0.7s ease' : 'none' }} />
          </div>
          <p className="text-xs text-neutral-500 mt-1">{state.stage}</p>
        </div>
      )}

      {state.status === "error" && (
        <p className="text-xs text-red-400 mb-2 break-words leading-tight">{state.error}</p>
      )}

      {state.status === "complete" && (
        <p className="text-[10px] text-green-500 mb-2">Done ✓</p>
      )}

      <button
        onClick={state.status === "running" ? cancel : run}
        className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm rounded-lg transition"
      >
        {state.status === "running" ? <X size={14} /> : <Film size={14} />}
        {state.status === "running" ? "Cancel" : "Animate"}
      </button>

      <Handle type="source" position={Position.Right} id="output" title="video" className="!bg-orange-400 !w-3.5 !h-3.5" />
    </div>
  );
}
