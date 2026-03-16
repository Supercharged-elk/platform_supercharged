"use client";
import { useEffect, useState } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { useCanvasStore } from "@/store/canvas";
import { api } from "@/lib/api";

interface ModelConfig {
  id: string;
  display_name: string;
  model_ref: string;
  trigger_word?: string;
  use_enrichment: boolean;
}

function isValidUUID(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

export function ModelSelectorNode({ id, data }: NodeProps) {
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const globalProjectId = useCanvasStore((s) => s.globalProjectId);
  const [models, setModels] = useState<ModelConfig[]>([]);
  const [loading, setLoading] = useState(false);

  const requiredTask = typeof data.required_task === "string" ? data.required_task : "";
  const isFixedTask = requiredTask === "multi_ref" || requiredTask === "video";
  const nodeProjectId = ((data.project_id as string) || "").trim();
  const projectId = (requiredTask === "multi_ref" ? (globalProjectId || nodeProjectId) : nodeProjectId).trim();
  const title = typeof data.title === "string" && data.title.trim().length > 0 ? data.title : "Model";

  useEffect(() => {
    // Fixed platform tasks (multi_ref, video) use global models endpoint
    if (isFixedTask) {
      setLoading(true);
      api.get<{ models: ModelConfig[] }>(`/models/global?task=${encodeURIComponent(requiredTask)}`)
        .then((r) => {
          setModels(r.models);
          // Auto-select the fixed platform model
          if (r.models.length > 0 && !((data.config as { id?: string } | undefined)?.id)) {
            const fixed = r.models[0];
            updateNodeData(id, { selected_model_id: fixed.id, config: fixed });
          }
        })
        .catch(() => setModels([]))
        .finally(() => setLoading(false));
      return;
    }

    if (!projectId || !isValidUUID(projectId)) return;
    const query = requiredTask ? `?task=${encodeURIComponent(requiredTask)}` : "";
    setLoading(true);
    api.get<{ models: ModelConfig[] }>(`/models/${projectId}${query}`)
      .then((r) => setModels(r.models))
      .catch(() => setModels([]))
      .finally(() => setLoading(false));
  }, [projectId, requiredTask, isFixedTask]);

  // Sync selected_model_id → config object
  useEffect(() => {
    const selectedModelId = (data.selected_model_id as string) || "";
    const hasConfig = !!(data.config as { id?: string } | undefined)?.id;
    if (!selectedModelId || hasConfig || models.length === 0) return;
    const selected = models.find((m) => m.id === selectedModelId);
    if (!selected) return;
    updateNodeData(id, { config: selected });
  }, [data.selected_model_id, data.config, models, updateNodeData, id]);

  // Sync globalProjectId → nodeProjectId for multi_ref
  useEffect(() => {
    if (requiredTask !== "multi_ref") return;
    if (!globalProjectId.trim()) return;
    if (nodeProjectId === globalProjectId.trim()) return;
    updateNodeData(id, { project_id: globalProjectId.trim() });
  }, [requiredTask, globalProjectId, nodeProjectId, updateNodeData, id]);

  const selectedConfig = (data.config as ModelConfig | undefined);

  return (
    <div className="bg-neutral-900 border border-neutral-700 rounded-xl p-3 w-56">
      <div className="text-xs font-semibold text-neutral-400 mb-2 uppercase tracking-wide">
        {title}
      </div>

      {/* Project input — only for non-fixed tasks */}
      {!isFixedTask ? (
        <input
          className="w-full bg-neutral-800 text-white text-sm rounded-lg p-2 border border-neutral-700 focus:outline-none mb-2"
          placeholder="Project ID (UUID)"
          value={nodeProjectId}
          onChange={(e) => updateNodeData(id, { project_id: e.target.value })}
        />
      ) : (
        <p className="text-[11px] text-neutral-500 mb-2">
          {requiredTask === "multi_ref" ? "Platform model: FLUX 2 Pro" : "Platform model: Kling v2.1"}
        </p>
      )}

      {loading ? (
        <p className="text-xs text-neutral-600">Loading models...</p>
      ) : models.length > 0 ? (
        <>
          <select
            className="w-full bg-neutral-800 text-white text-sm rounded-lg p-2 border border-neutral-700 focus:outline-none"
            value={(data.selected_model_id as string) || ""}
            onChange={(e) => {
              const model = models.find((m) => m.id === e.target.value);
              updateNodeData(id, { selected_model_id: e.target.value, config: model });
            }}
          >
            <option value="">Select model...</option>
            {models.map((m) => (
              <option key={m.id} value={m.id}>{m.display_name}</option>
            ))}
          </select>
          {selectedConfig?.id && (
            <p className="text-[10px] text-green-600 mt-1 truncate">✓ {selectedConfig.display_name}</p>
          )}
        </>
      ) : (
        <p className="text-xs text-neutral-600">
          {isFixedTask
            ? "No platform model available"
            : !nodeProjectId
            ? "No project selected"
            : !isValidUUID(nodeProjectId)
            ? "Enter a valid project UUID"
            : "No models in this project"}
        </p>
      )}

      <Handle type="source" position={Position.Right} id="output" className="!bg-neutral-500 !w-3 !h-3" />
    </div>
  );
}
