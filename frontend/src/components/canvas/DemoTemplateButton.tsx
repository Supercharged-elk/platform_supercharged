"use client";
import { useCanvasStore } from "@/store/canvas";
import { buildSimpleDemoGraph } from "@/components/canvas/demoTemplate";

export function DemoTemplateButton() {
  const { loadGraph } = useCanvasStore();

  const loadDemo = () => {
    const { nodes, edges } = buildSimpleDemoGraph();
    loadGraph(nodes, edges);
  };

  return (
    <button
      type="button"
      data-testid="load-demo"
      onClick={loadDemo}
      className="px-2 py-1 text-xs bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded border border-neutral-700 transition"
    >
      Load Demo
    </button>
  );
}
