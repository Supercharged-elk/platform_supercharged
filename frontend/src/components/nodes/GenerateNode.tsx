"use client";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { useCanvasStore } from "@/store/canvas";
import { useAuthStore } from "@/store/auth";
import { cancelRun, executeNode } from "@/lib/executor";
import { SignInToGenerateModal } from "@/components/auth/SignInToGenerateModal";
import { useSignInGate } from "@/hooks/useSignInGate";
import { Play, X } from "lucide-react";

export function GenerateNode({ id }: NodeProps) {
  const { nodes, edges, nodeStates, setNodeState } = useCanvasStore();
  const fetchCredits = useAuthStore((s) => s.fetchCredits);
  const { showGate, setShowGate, checkGate } = useSignInGate();
  const state = nodeStates[id] || { status: "idle", progress: 0, stage: "" };

  // Determine active model label
  const configEdge = edges.find((e) => e.target === id && e.targetHandle === "config");
  const configSourceNode = configEdge ? nodes.find((n) => n.id === configEdge.source) : null;
  const modelLabel =
    (configSourceNode?.data?.config as { display_name?: string } | undefined)?.display_name ||
    (configSourceNode?.data?.selected_model_id as string | undefined) ||
    "FLUX 1.1 Pro";

  const promptEdge = edges.find((e) => e.target === id && e.targetHandle === "prompt");

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
        if (nodeId === id) return undefined; // always re-run this node
        const ns = nodeStates[nodeId];
        return (ns?.status === "complete" && ns.output !== undefined) ? ns.output : undefined;
      },
    });
  };

  const cancel = () => {
    if (typeof state.runId === "string") cancelRun(state.runId);
    setNodeState(id, { status: "error", error: "Run cancelled", stage: "Cancelled" });
  };

  return (
    <div className="bg-neutral-900 border border-neutral-700 rounded-xl p-3 w-56">
      {showGate && <SignInToGenerateModal onClose={() => setShowGate(false)} />}
      <Handle type="target" position={Position.Left} id="prompt" title="prompt" className="!bg-yellow-500 !w-3.5 !h-3.5" style={{ top: "35%" }} />
      <Handle type="target" position={Position.Left} id="config" title="config" className="!bg-purple-400 !w-3.5 !h-3.5" style={{ top: "65%" }} />

      <div className="text-xs font-semibold text-neutral-400 mb-1 uppercase tracking-wide">Generate</div>
      <p className="text-[10px] text-neutral-600 mb-2 truncate" title={modelLabel}>{modelLabel}</p>

      {!promptEdge && state.status === "idle" && (
        <p className="text-[10px] text-amber-500 mb-2">Connect a Prompt node</p>
      )}

      {state.status === "running" && (
        <div className="mb-2">
          <div className="w-full bg-neutral-800 rounded-full h-1.5">
            <div className="bg-blue-500 h-1.5 rounded-full transition-all duration-700" style={{ width: `${state.progress}%` }} />
          </div>
          <p className="text-xs text-neutral-500 mt-1">{state.stage}</p>
        </div>
      )}

      {state.status === "error" && (
        <p className="text-xs text-red-400 mb-2 truncate">{state.error}</p>
      )}

      {state.status === "complete" && (
        <p className="text-[10px] text-green-500 mb-2">Done ✓</p>
      )}

      <button
        onClick={state.status === "running" ? cancel : run}
        className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg transition"
      >
        {state.status === "running" ? <X size={14} /> : <Play size={14} />}
        {state.status === "running" ? "Cancel" : "Run"}
      </button>

      <Handle type="source" position={Position.Right} id="output" title="image" className="!bg-blue-400 !w-3.5 !h-3.5" />
    </div>
  );
}
