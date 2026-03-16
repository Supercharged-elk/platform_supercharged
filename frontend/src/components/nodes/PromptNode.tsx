"use client";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { useCanvasStore } from "@/store/canvas";

export function PromptNode({ id, data }: NodeProps) {
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const title = typeof data.title === "string" && data.title.trim().length > 0 ? data.title : "Prompt";

  return (
    <div className="bg-neutral-900 border border-neutral-700 rounded-xl p-3 w-64">
      <div className="text-xs font-semibold text-neutral-400 mb-2 uppercase tracking-wide">
        {title}
      </div>
      <textarea
        className="nodrag nowheel w-full bg-neutral-800 text-white text-sm rounded-lg p-2 resize-none border border-neutral-700 focus:outline-none focus:border-neutral-500"
        rows={4}
        placeholder="Describe what you want to generate..."
        value={(data.prompt as string) || ""}
        onChange={(e) => updateNodeData(id, { prompt: e.target.value })}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="output"
        title="text"
        className="!bg-yellow-500 !w-3.5 !h-3.5"
      />
    </div>
  );
}
