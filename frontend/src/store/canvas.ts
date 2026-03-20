import { create } from "zustand";
import {
  type Node,
  type Edge,
  addEdge,
  applyNodeChanges,
  applyEdgeChanges,
  type NodeChange,
  type EdgeChange,
  type Connection,
} from "@xyflow/react";

interface NodeState {
  status: "idle" | "running" | "complete" | "error";
  progress: number;
  stage: string;
  output?: unknown;
  error?: string;
  runId?: string;
}

interface CanvasStore {
  nodes: Node[];
  edges: Edge[];
  nodeStates: Record<string, NodeState>;
  isDirty: boolean;
  globalProjectId: string;
  connectionError: string | null;
  _history: Array<{ nodes: Node[]; edges: Edge[] }>;
  _future: Array<{ nodes: Node[]; edges: Edge[] }>;

  setNodes: (nodes: Node[]) => void;
  setEdges: (edges: Edge[]) => void;
  setGlobalProjectId: (projectId: string) => void;
  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onConnect: (connection: Connection) => void;
  clearConnectionError: () => void;
  updateNodeData: (id: string, data: Record<string, unknown>) => void;
  setNodeState: (id: string, state: Partial<NodeState>) => void;
  loadGraph: (nodes: Node[], edges: Edge[]) => void;
  markSaved: () => void;
  undo: () => void;
  redo: () => void;
  _pushHistory: () => void;
}

type DataType = "text" | "image" | "video" | "config" | "unknown";
type DirtyRelevantNodeChange = NodeChange["type"];
type DirtyRelevantEdgeChange = EdgeChange["type"];

const DIRTY_NODE_CHANGE_TYPES = new Set<DirtyRelevantNodeChange>([
  "add",
  "remove",
  "replace",
  "position",
]);

const DIRTY_EDGE_CHANGE_TYPES = new Set<DirtyRelevantEdgeChange>([
  "add",
  "remove",
  "replace",
]);

function getSourceDataType(nodeType: string, handleId?: string | null): DataType {
  if (nodeType === "promptNode") return "text";
  if (nodeType === "modelSelectorNode") return "config";
  if (nodeType === "generateNode" || nodeType === "editNode" || nodeType === "multiRefNode") return "image";
  if (nodeType === "videoNode") return "video";
  if (nodeType === "imageOutputNode") return "image";
  if (nodeType === "videoOutputNode") return "video";
  return "unknown";
}

function getTargetDataType(nodeType: string, handleId?: string | null): DataType {
  if (nodeType === "generateNode") {
    if (handleId === "prompt") return "text";
    if (handleId === "config") return "config";
  }
  if (nodeType === "editNode") {
    if (handleId === "prompt") return "text";
    if (handleId === "image") return "image";
    if (handleId === "config") return "config";
  }
  if (nodeType === "videoNode") {
    if (handleId === "prompt") return "text";
    if (handleId === "image") return "image";
    if (handleId === "config") return "config";
  }
  if (nodeType === "multiRefNode") {
    if (handleId === "prompt") return "text";
    if ((handleId || "").startsWith("ref_")) return "image";
    if (handleId === "config") return "config";
  }
  if (nodeType === "imageOutputNode") return "image";
  if (nodeType === "videoOutputNode") return "video";
  return "unknown";
}

export function isConnectionValid(connection: Connection, nodes: Node[]): boolean {
  if (!connection.source || !connection.target) return false;
  const sourceNode = nodes.find((n) => n.id === connection.source);
  const targetNode = nodes.find((n) => n.id === connection.target);
  if (!sourceNode || !targetNode) return false;

  const sourceType = getSourceDataType(sourceNode.type || "unknown", connection.sourceHandle);
  const targetType = getTargetDataType(targetNode.type || "unknown", connection.targetHandle);
  if (targetType === "unknown" || sourceType === "unknown") return false;

  return sourceType === targetType;
}

export const TYPE_COLORS: Record<string, string> = {
  text: "#eab308",
  image: "#60a5fa",
  config: "#c084fc",
  video: "#fb923c",
};

/** Apply the standard color/label style to a pre-built edge (template edges, demo graph). */
export function styledEdge(
  edge: Edge,
  sourceNodeType: string,
  sourceHandle?: string | null
): Edge {
  const type = getSourceDataType(sourceNodeType, sourceHandle);
  const color = TYPE_COLORS[type] || "#888";
  return {
    ...edge,
    label: type,
    labelStyle: { fontSize: 8, fill: color, fontFamily: "monospace", fontWeight: 600 },
    labelBgStyle: { fill: "#171717", fillOpacity: 0.85 },
    labelBgPadding: [2, 4] as [number, number],
    labelBgBorderRadius: 3,
    style: { stroke: color, strokeWidth: 1.5, opacity: 0.7 },
  };
}

const MAX_HISTORY = 50;

export const useCanvasStore = create<CanvasStore>((set, get) => ({
  nodes: [],
  edges: [],
  nodeStates: {},
  isDirty: false,
  globalProjectId: "",
  connectionError: null,
  _history: [],
  _future: [],

  _pushHistory: () =>
    set((state) => ({
      _history: [...state._history.slice(-MAX_HISTORY + 1), { nodes: state.nodes, edges: state.edges }],
      _future: [],
    })),

  setNodes: (nodes) => {
    get()._pushHistory();
    set({ nodes, isDirty: true });
  },
  setEdges: (edges) => {
    get()._pushHistory();
    set({ edges, isDirty: true });
  },
  setGlobalProjectId: (projectId) => set({ globalProjectId: projectId }),

  onNodesChange: (changes) =>
    set((state) => {
      const structural = changes.some((c) => DIRTY_NODE_CHANGE_TYPES.has(c.type));
      return {
        nodes: applyNodeChanges(changes, state.nodes),
        isDirty: structural ? true : state.isDirty,
      };
    }),

  onEdgesChange: (changes) =>
    set((state) => {
      const structural = changes.some((c) => DIRTY_EDGE_CHANGE_TYPES.has(c.type));
      return {
        edges: applyEdgeChanges(changes, state.edges),
        isDirty: structural ? true : state.isDirty,
      };
    }),

  onConnect: (connection) =>
    set((state) => {
      const valid = isConnectionValid(connection, state.nodes);
      if (!valid) {
        return { connectionError: "Incompatible connection — data types don't match" };
      }
      const sourceNode = state.nodes.find((n) => n.id === connection.source);
      const sourceType = getSourceDataType(sourceNode?.type || "unknown", connection.sourceHandle);
      const color = TYPE_COLORS[sourceType] || "#888";
      const edgeWithLabel = {
        ...connection,
        label: sourceType,
        labelStyle: { fontSize: 8, fill: color, fontFamily: "monospace", fontWeight: 600 },
        labelBgStyle: { fill: "#171717", fillOpacity: 0.85 },
        labelBgPadding: [2, 4] as [number, number],
        labelBgBorderRadius: 3,
        style: { stroke: color, strokeWidth: 1.5, opacity: 0.7 },
      };
      return {
        edges: addEdge(edgeWithLabel, state.edges),
        isDirty: true,
        connectionError: null,
        _history: [...state._history.slice(-MAX_HISTORY + 1), { nodes: state.nodes, edges: state.edges }],
        _future: [],
      };
    }),

  clearConnectionError: () => set({ connectionError: null }),

  updateNodeData: (id, data) =>
    set((state) => ({
      nodes: state.nodes.map((n) =>
        n.id === id ? { ...n, data: { ...n.data, ...data } } : n
      ),
      isDirty: true,
    })),

  setNodeState: (id, nodeState) =>
    set((state) => ({
      nodeStates: {
        ...state.nodeStates,
        [id]: { ...state.nodeStates[id], ...nodeState } as NodeState,
      },
    })),

  loadGraph: (nodes, edges) => set({ nodes, edges, nodeStates: {}, isDirty: false, _history: [], _future: [] }),

  markSaved: () => set({ isDirty: false }),

  undo: () =>
    set((state) => {
      if (state._history.length === 0) return {};
      const prev = state._history[state._history.length - 1];
      return {
        nodes: prev.nodes,
        edges: prev.edges,
        _history: state._history.slice(0, -1),
        _future: [{ nodes: state.nodes, edges: state.edges }, ...state._future.slice(0, MAX_HISTORY - 1)],
        isDirty: true,
      };
    }),

  redo: () =>
    set((state) => {
      if (state._future.length === 0) return {};
      const next = state._future[0];
      return {
        nodes: next.nodes,
        edges: next.edges,
        _future: state._future.slice(1),
        _history: [...state._history.slice(-MAX_HISTORY + 1), { nodes: state.nodes, edges: state.edges }],
        isDirty: true,
      };
    }),
}));
