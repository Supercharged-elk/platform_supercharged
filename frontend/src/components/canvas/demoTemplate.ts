import type { Edge, Node } from "@xyflow/react";

export function buildSimpleDemoGraph(): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [
    {
      id: "demo_prompt",
      type: "promptNode",
      position: { x: 80, y: 180 },
      data: { prompt: "A golden retriever wearing a tiny astronaut helmet, floating in space, cinematic lighting" },
    },
    {
      id: "demo_generate",
      type: "generateNode",
      position: { x: 420, y: 160 },
      data: {},
    },
    {
      id: "demo_output",
      type: "imageOutputNode",
      position: { x: 730, y: 140 },
      data: {},
    },
  ];

  const edges: Edge[] = [
    {
      id: "demo_e1",
      source: "demo_prompt",
      target: "demo_generate",
      sourceHandle: "output",
      targetHandle: "prompt",
    },
    {
      id: "demo_e2",
      source: "demo_generate",
      target: "demo_output",
      sourceHandle: "output",
      targetHandle: "input",
    },
  ];

  return { nodes, edges };
}
