"use client";
import { useCallback } from "react";
import { useCanvasStore, styledEdge } from "@/store/canvas";
import { MessageSquare, Cpu, Zap, Wand2, Film, Images, ImageIcon, Video } from "lucide-react";

const NODE_DEFS = [
  { type: "promptNode", label: "Prompt", icon: MessageSquare, color: "text-neutral-400" },
  { type: "modelSelectorNode", label: "Model", icon: Cpu, color: "text-neutral-400" },
  { type: "generateNode", label: "Generate", icon: Zap, color: "text-blue-400" },
  { type: "editNode", label: "Edit", icon: Wand2, color: "text-purple-400" },
  { type: "videoNode", label: "Animate", icon: Film, color: "text-orange-400" },
  { type: "multiRefNode", label: "Multi-Ref", icon: Images, color: "text-green-400" },
  { type: "imageOutputNode", label: "Image Out", icon: ImageIcon, color: "text-neutral-400" },
  { type: "videoOutputNode", label: "Video Out", icon: Video, color: "text-neutral-400" },
] as const;

let nodeCounter = 0;

function nextNodeId(type: string, existingIds: string[]): string {
  const prefix = `${type}_`;
  const maxForType = existingIds
    .filter((id) => id.startsWith(prefix))
    .map((id) => Number.parseInt(id.slice(prefix.length), 10))
    .filter((n) => Number.isFinite(n))
    .reduce((max, n) => Math.max(max, n), 0);

  nodeCounter = Math.max(nodeCounter, maxForType) + 1;
  return `${type}_${nodeCounter}`;
}

export function Toolbar() {
  const setNodes = useCanvasStore((s) => s.setNodes);
  const setEdges = useCanvasStore((s) => s.setEdges);
  const nodes = useCanvasStore((s) => s.nodes);
  const edges = useCanvasStore((s) => s.edges);
  const globalProjectId = useCanvasStore((s) => s.globalProjectId);

  const addNode = useCallback(
    (type: string) => {
      if (type === "multiRefNode") {
        const allIds = nodes.map((n) => n.id);
        const workingIds = [...allIds];
        const makeId = (nodeType: string) => {
          const id = nextNodeId(nodeType, workingIds);
          workingIds.push(id);
          return id;
        };

        const baseX = 80 + Math.random() * 120;
        const baseY = 80 + Math.random() * 80;
        const promptFinalId = makeId("promptNode");
        const modelId = makeId("modelSelectorNode");
        const multiRefId = makeId("multiRefNode");
        const imageOutId = makeId("imageOutputNode");

        const templateNodes = [
          {
            id: promptFinalId,
            type: "promptNode",
            position: { x: baseX, y: baseY },
            data: { title: "Final Prompt", prompt: "Describe the final image using your references" },
          },
          {
            id: modelId,
            type: "modelSelectorNode",
            position: { x: baseX, y: baseY + 180 },
            data: globalProjectId
              ? { project_id: globalProjectId, title: "Multi-Ref Model", required_task: "multi_ref" }
              : { title: "Multi-Ref Model", required_task: "multi_ref" },
          },
          {
            id: multiRefId,
            type: "multiRefNode",
            position: { x: baseX + 360, y: baseY + 60 },
            data: { title: "Compose References" },
          },
          {
            id: imageOutId,
            type: "imageOutputNode",
            position: { x: baseX + 730, y: baseY + 80 },
            data: { title: "Final Image" },
          },
        ];

        const templateEdges = [
          styledEdge({ id: `e_${promptFinalId}_${multiRefId}_prompt`, source: promptFinalId, target: multiRefId, sourceHandle: "output", targetHandle: "prompt" }, "promptNode", "output"),
          styledEdge({ id: `e_${modelId}_${multiRefId}_cfg`, source: modelId, target: multiRefId, sourceHandle: "output", targetHandle: "config" }, "modelSelectorNode", "output"),
          styledEdge({ id: `e_${multiRefId}_${imageOutId}_out`, source: multiRefId, target: imageOutId, sourceHandle: "output", targetHandle: "input" }, "multiRefNode", "output"),
        ];

        setNodes([...nodes, ...templateNodes]);
        setEdges([...edges, ...templateEdges]);
        return;
      }

      if (type === "editNode") {
        const allIds = nodes.map((n) => n.id);
        const workingIds = [...allIds];
        const makeId = (nodeType: string) => {
          const id = nextNodeId(nodeType, workingIds);
          workingIds.push(id);
          return id;
        };

        const baseX = 80 + Math.random() * 120;
        const baseY = 80 + Math.random() * 80;
        const promptId = makeId("promptNode");
        const modelId = makeId("modelSelectorNode");
        const editId = makeId("editNode");
        const imageOutId = makeId("imageOutputNode");

        const templateNodes = [
          {
            id: promptId,
            type: "promptNode",
            position: { x: baseX, y: baseY },
            data: { prompt: "Describe the edit to apply" },
          },
          {
            id: modelId,
            type: "modelSelectorNode",
            position: { x: baseX, y: baseY + 180 },
            data: { title: "Edit Model", required_task: "edit" },
          },
          {
            id: editId,
            type: "editNode",
            position: { x: baseX + 360, y: baseY + 60 },
            data: {},
          },
          {
            id: imageOutId,
            type: "imageOutputNode",
            position: { x: baseX + 680, y: baseY + 80 },
            data: {},
          },
        ];

        const templateEdges = [
          styledEdge({ id: `e_${promptId}_${editId}_prompt`, source: promptId, target: editId, sourceHandle: "output", targetHandle: "prompt" }, "promptNode", "output"),
          styledEdge({ id: `e_${modelId}_${editId}_cfg`, source: modelId, target: editId, sourceHandle: "output", targetHandle: "config" }, "modelSelectorNode", "output"),
          styledEdge({ id: `e_${editId}_${imageOutId}_out`, source: editId, target: imageOutId, sourceHandle: "output", targetHandle: "input" }, "editNode", "output"),
        ];

        setNodes([...nodes, ...templateNodes]);
        setEdges([...edges, ...templateEdges]);
        return;
      }

      const newNode = {
        id: nextNodeId(type, nodes.map((n) => n.id)),
        type,
        position: { x: 100 + Math.random() * 300, y: 100 + Math.random() * 200 },
        data:
          type === "modelSelectorNode" && globalProjectId
            ? { project_id: globalProjectId }
            : {},
      };
      setNodes([...nodes, newNode]);
    },
    [nodes, edges, setNodes, setEdges, globalProjectId]
  );

  return (
    <div className="absolute left-4 top-1/2 -translate-y-1/2 z-10 flex flex-col gap-1 bg-neutral-900 border border-neutral-700 rounded-xl p-2">
      {NODE_DEFS.map(({ type, label, icon: Icon, color }) => (
        <button
          key={type}
          onClick={() => addNode(type)}
          title={label}
          className="flex items-center gap-2 px-3 py-2 hover:bg-neutral-800 rounded-lg transition text-sm text-neutral-300 whitespace-nowrap"
        >
          <Icon size={14} className={color} />
          <span className="text-xs">{label}</span>
        </button>
      ))}
    </div>
  );
}
