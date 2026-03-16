"use client";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { useCanvasStore } from "@/store/canvas";
import { cancelRun, executeNode } from "@/lib/executor";
import { Play, X, Download } from "lucide-react";

export function VideoOutputNode({ id }: NodeProps) {
  const { nodes, edges, nodeStates, setNodeState } = useCanvasStore();
  const state = nodeStates[id] || { status: "idle", progress: 0, stage: "" };
  const videoUrl = state?.output as string | undefined;

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
      <Handle type="target" position={Position.Left} id="input" title="video" className="!bg-orange-400 !w-3.5 !h-3.5" />
      <Handle type="source" position={Position.Right} id="output" title="video out" className="!bg-orange-400 !w-3.5 !h-3.5" />

      <div className="px-3 pt-3 pb-2 flex items-center justify-between">
        <span className="text-xs font-semibold text-neutral-400 uppercase tracking-wide">Video</span>
        <div className="flex items-center gap-2">
          <button
            onClick={state.status === "running" ? cancel : run}
            className="text-neutral-600 hover:text-neutral-300 disabled:opacity-50 transition"
            title="Run chain"
          >
            {state.status === "running" ? <X size={14} /> : <Play size={14} />}
          </button>
          {videoUrl && (
            <a
              href={videoUrl}
              download
              target="_blank"
              rel="noreferrer"
              className="text-neutral-600 hover:text-neutral-300 transition"
              title="Download video"
            >
              <Download size={14} />
            </a>
          )}
        </div>
      </div>
      {state.status === "error" && (
        <p className="px-3 pb-2 text-xs text-red-400">{state.error}</p>
      )}

      {videoUrl ? (
        <video
          src={videoUrl}
          controls
          autoPlay
          loop
          muted
          className="w-full"
        />
      ) : (
        <div className="h-48 bg-neutral-800 flex items-center justify-center">
          <span className="text-xs text-neutral-600">No video yet</span>
        </div>
      )}
    </div>
  );
}
