"use client";
import { useEffect } from "react";
import { ReactFlow, Background, Controls, MiniMap, BackgroundVariant, useReactFlow } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useCanvasStore, isConnectionValid } from "@/store/canvas";
import { nodeTypes } from "@/components/nodes";

export function Canvas() {
  const { nodes, edges, onNodesChange, onEdgesChange, onConnect, connectionError, clearConnectionError, undo, redo, setNodes } = useCanvasStore();

  useEffect(() => {
    if (!connectionError) return;
    const t = setTimeout(clearConnectionError, 3000);
    return () => clearTimeout(t);
  }, [connectionError, clearConnectionError]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if ((e.metaKey || e.ctrlKey) && e.key === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      }
      // Ctrl+D — duplicate selected nodes
      if ((e.metaKey || e.ctrlKey) && e.key === "d") {
        e.preventDefault();
        const selected = nodes.filter((n) => n.selected);
        if (selected.length === 0) return;
        const duplicates = selected.map((n) => ({
          ...n,
          id: `${n.id}_copy_${Date.now()}`,
          position: { x: n.position.x + 40, y: n.position.y + 40 },
          selected: false,
          data: { ...n.data },
        }));
        setNodes([...nodes.map((n) => ({ ...n, selected: false })), ...duplicates]);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [undo, redo, nodes, setNodes]);

  return (
    <div className="w-full h-full relative">
      {connectionError && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 bg-red-900/90 border border-red-700 text-red-200 text-xs rounded-lg shadow-lg pointer-events-none">
          {connectionError}
        </div>
      )}
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        isValidConnection={(connection) => isConnectionValid(connection as import("@xyflow/react").Connection, nodes)}
        nodeTypes={nodeTypes}
        fitView
        deleteKeyCode={["Backspace", "Delete"]}
        proOptions={{ hideAttribution: true }}
        className="bg-neutral-950"
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={24}
          size={1}
          color="#333"
        />
        <Controls className="!bg-neutral-900 !border-neutral-700" />
        <MiniMap
          className="!bg-neutral-900 !border-neutral-700"
          nodeColor="#555"
          maskColor="rgba(0,0,0,0.6)"
        />
      </ReactFlow>
    </div>
  );
}
