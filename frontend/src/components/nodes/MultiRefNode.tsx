"use client";
import { useRef, useState } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { useCanvasStore } from "@/store/canvas";
import { useAuthStore } from "@/store/auth";
import { SignInToGenerateModal } from "@/components/auth/SignInToGenerateModal";
import { useSignInGate } from "@/hooks/useSignInGate";
import { cancelRun, executeNode } from "@/lib/executor";
import { api } from "@/lib/api";
import { Images, X } from "lucide-react";

export function MultiRefNode({ id, data }: NodeProps) {
  const { nodes, edges, nodeStates, setNodeState, updateNodeData } = useCanvasStore();
  const fetchCredits = useAuthStore((s) => s.fetchCredits);
  const { showGate, setShowGate, checkGate } = useSignInGate();
  const state = nodeStates[id] || { status: "idle", progress: 0, stage: "" };
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const manualRefs = Array.isArray(data.refs)
    ? data.refs.filter((r): r is string => typeof r === "string")
    : [];
  const connectedRefHandles = new Set(
    edges
      .filter((edge) => edge.target === id && (edge.targetHandle || "").startsWith("ref_"))
      .map((edge) => edge.targetHandle || "")
      .filter(Boolean)
  );
  const connectedRefCount = connectedRefHandles.size;
  const manualFilledRefs = manualRefs.filter((r) => r.trim().length > 0);
  const manualFilledCount = manualFilledRefs.length;
  const totalRefs = connectedRefCount + manualFilledCount;
  const slotsRemaining = Math.max(0, 8 - totalRefs);
  const hasRefOverflow = totalRefs > 8;
  const hasPromptInput = edges.some(
    (edge) => edge.target === id && edge.targetHandle === "prompt"
  );
  const hasConfigInput = edges.some(
    (edge) => edge.target === id && edge.targetHandle === "config"
  );
  const title = typeof data.title === "string" && data.title.trim().length > 0 ? data.title : "Multi-Ref";

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

  const setManualRef = (index: number, value: string) => {
    const next = [...manualRefs];
    next[index] = value;
    updateNodeData(id, { refs: next });
  };

  const addManualRef = () => {
    if (slotsRemaining <= 0) return;
    updateNodeData(id, { refs: [...manualRefs, ""] });
  };

  const removeManualRef = (index: number) => {
    const next = manualRefs.filter((_, i) => i !== index);
    updateNodeData(id, { refs: next });
  };

  const uploadFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploadError(null);
    setUploading(true);
    try {
      const nextRefs = [...manualRefs];
      let remaining = Math.max(0, 8 - connectedRefCount - nextRefs.filter((r) => r.trim().length > 0).length);
      for (const file of Array.from(files)) {
        if (remaining <= 0) break;
        const formData = new FormData();
        formData.append("file", file);
        const res = await api.postForm<{ url: string }>("/uploads/image", formData);
        if (typeof res.url === "string" && res.url.trim()) {
          nextRefs.push(res.url.trim());
          remaining -= 1;
        }
      }
      updateNodeData(id, { refs: nextRefs });
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  return (
    <div className="bg-neutral-900 border border-neutral-700 rounded-xl p-3 w-72">
      {/* Hasta 8 handles de referencia — distribuidos en el 10%-75% del nodo */}
      {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
        <Handle
          key={i}
          type="target"
          position={Position.Left}
          id={`ref_${i}`}
          title={`ref_${i}`}
          className="!bg-blue-400 !w-3 !h-3"
          style={{ top: `${10 + i * 9}%` }}
        />
      ))}
      <Handle type="target" position={Position.Left} id="prompt" title="prompt" className="!bg-yellow-500 !w-3 !h-3" style={{ top: "83%" }} />
      <Handle type="target" position={Position.Left} id="config" title="config" className="!bg-purple-400 !w-3 !h-3" style={{ top: "92%" }} />

      <div className="text-xs font-semibold text-neutral-400 mb-2 uppercase tracking-wide">
        {title}
      </div>
      <div className="mb-2 space-y-1">
        <p className="text-[11px] text-neutral-500">
          total refs: {Math.min(totalRefs, 8)}/8 · prompt: {hasPromptInput ? "connected" : "manual/optional"}
        </p>
        <p className="text-[10px] text-neutral-600">
          Sources: connected nodes, manual URLs, local uploads
        </p>
        <p className="text-[10px] text-neutral-600">
          Model: {hasConfigInput ? "connected" : "missing"}
        </p>
        <div className="flex items-center gap-1.5 text-[10px]">
          <span className="px-1.5 py-0.5 rounded bg-neutral-800 border border-neutral-700 text-neutral-300">
            Connected: {connectedRefCount}
          </span>
          <span className="px-1.5 py-0.5 rounded bg-neutral-800 border border-neutral-700 text-neutral-300">
            Manual/Upload: {manualFilledCount}
          </span>
          <span className="px-1.5 py-0.5 rounded bg-neutral-800 border border-neutral-700 text-neutral-300">
            Remaining: {slotsRemaining}
          </span>
        </div>
      </div>

      <textarea
        value={(data.prompt as string) || ""}
        onChange={(e) => updateNodeData(id, { prompt: e.target.value })}
        placeholder="Prompt (optional if Prompt node is connected)"
        className="nodrag nowheel w-full bg-neutral-800 text-white text-xs rounded-lg p-2 border border-neutral-700 focus:outline-none mb-2 min-h-[54px]"
      />

      <div className="space-y-1.5 mb-2">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            void uploadFiles(e.target.files);
          }}
        />
        <button
          type="button"
          disabled={uploading || slotsRemaining <= 0}
          onClick={() => fileInputRef.current?.click()}
          className="w-full text-xs px-2 py-1.5 rounded bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-neutral-300 disabled:opacity-50"
        >
          {uploading ? "Uploading..." : "Upload local image(s)"}
        </button>
        {manualRefs.map((ref, index) => (
          <div key={`manual_ref_${index}`} className="flex items-center gap-1">
            <input
              value={ref}
              onChange={(e) => setManualRef(index, e.target.value)}
              placeholder={`Reference URL ${index + 1}`}
              className="flex-1 bg-neutral-800 text-white text-xs rounded-lg px-2 py-1.5 border border-neutral-700 focus:outline-none"
            />
            <button
              type="button"
              onClick={() => removeManualRef(index)}
              className="text-[10px] px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-neutral-300"
            >
              x
            </button>
          </div>
        ))}
        {slotsRemaining > 0 && (
          <button
            type="button"
            onClick={addManualRef}
            className="w-full text-xs px-2 py-1.5 rounded bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-neutral-300"
          >
            + Add reference URL
          </button>
        )}
        {hasRefOverflow && (
          <p className="text-[11px] text-red-400">
            Too many references connected/manual. Keep maximum 8 total.
          </p>
        )}
        {uploadError && <p className="text-[11px] text-red-400">{uploadError}</p>}
      </div>

      {state.status === "running" && (
        <div className="mb-2">
          <div className="w-full bg-neutral-800 rounded-full h-1.5">
            <div className="bg-green-500 h-1.5 rounded-full" style={{ width: `${state.progress ?? 0}%`, transition: (state.progress ?? 0) > 0 ? 'width 0.7s ease' : 'none' }} />
          </div>
          <p className="text-xs text-neutral-500 mt-1">{state.stage}</p>
        </div>
      )}

      {state.status === "error" && (
        <p className="text-xs text-red-400 mb-2 truncate">{state.error}</p>
      )}

      <button
        disabled={!hasConfigInput}
        onClick={state.status === "running" ? cancel : run}
        className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-green-600 hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm rounded-lg transition"
      >
        {state.status === "running" ? <X size={14} /> : <Images size={14} />}
        {state.status === "running" ? "Cancel" : "Compose"}
      </button>
      {!hasConfigInput && (
        <p className="text-[11px] text-amber-400 mt-2">
          Connect a Multi-Ref Model before composing.
        </p>
      )}

      <Handle type="source" position={Position.Right} id="output" title="image" className="!bg-blue-400 !w-3.5 !h-3.5" />
    </div>
  );
}
