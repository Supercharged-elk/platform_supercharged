"use client";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { useCanvasStore } from "@/store/canvas";
import { cancelRun, executeNode } from "@/lib/executor";
import { Download, Play, X } from "lucide-react";

export function ImageOutputNode({ id }: NodeProps) {
  const { nodes, edges, nodeStates, setNodeState } = useCanvasStore();
  const state = nodeStates[id] || { status: "idle", progress: 0, stage: "" };
  const imageUrl = state?.output as string | undefined;
  const title =
    typeof (nodes.find((n) => n.id === id)?.data?.title) === "string" &&
    String(nodes.find((n) => n.id === id)?.data?.title).trim().length > 0
      ? String(nodes.find((n) => n.id === id)?.data?.title)
      : "Output";

  const run = async () => {
    const runId = `${id}_${Date.now()}`;
    setNodeState(id, { status: "running", progress: 0, stage: "Resolving inputs...", runId });
    await executeNode(id, nodes as Parameters<typeof executeNode>[1], edges, {
      onNodeStart: (nid) => setNodeState(nid, { status: "running" }),
      onNodeProgress: (nid, pct, stage) => setNodeState(nid, { progress: pct, stage }),
      onNodeComplete: (nid, outputs) => setNodeState(nid, { status: "complete", output: outputs.output }),
      onNodeError: (nid, error) => setNodeState(nid, { status: "error", error }),
    }, { runId });
  };

  const cancel = () => {
    if (typeof state.runId === "string") {
      cancelRun(state.runId);
    }
    setNodeState(id, { status: "error", error: "Run cancelled", stage: "Cancelled" });
  };

  return (
    <div className="bg-neutral-900 border border-neutral-700 rounded-xl overflow-hidden w-64">
      <Handle type="target" position={Position.Left} id="input" title="image" className="!bg-blue-400 !w-3.5 !h-3.5" />
      <Handle type="source" position={Position.Right} id="output" title="image out" className="!bg-blue-400 !w-3.5 !h-3.5" />

      <div className="px-3 pt-3 pb-2 flex items-center justify-between">
        <span className="text-xs font-semibold text-neutral-400 uppercase tracking-wide">{title}</span>
        <div className="flex items-center gap-2">
          <button
            onClick={state.status === "running" ? cancel : run}
            className="text-neutral-600 hover:text-neutral-300 disabled:opacity-50 transition"
            title="Run chain"
          >
            {state.status === "running" ? <X size={14} /> : <Play size={14} />}
          </button>
          {imageUrl && (
            <a
              href={imageUrl}
              download
              target="_blank"
              rel="noreferrer"
              className="text-neutral-600 hover:text-neutral-300 transition"
            >
              <Download size={14} />
            </a>
          )}
        </div>
      </div>
      {state.status === "error" && (
        <p className="px-3 pb-2 text-xs text-red-400">{state.error}</p>
      )}

      {imageUrl ? (
        <img src={imageUrl} alt="Generated output" className="w-full object-cover" />
      ) : (
        <div className="h-48 bg-neutral-800 flex items-center justify-center">
          <span className="text-xs text-neutral-600">No output yet</span>
        </div>
      )}
    </div>
  );
}
