/**
 * Motor de ejecución del grafo — canvas executor.
 *
 * Flujo:
 * 1. Usuario hace click "Run" en un nodo de ejecución
 * 2. BFS hacia atrás: encontrar todos los nodos upstream
 * 3. Topological sort del subgrafo
 * 4. Ejecutar en orden: data nodes sin API, execution nodes con API
 * 5. Pasar outputs como inputs del nodo siguiente
 * 6. Polling progress cada 1500ms hasta completion
 */
import { api } from "./api";

export type NodeType =
  | "promptNode"
  | "modelSelectorNode"
  | "generateNode"
  | "editNode"
  | "videoNode"
  | "multiRefNode"
  | "imageOutputNode"
  | "videoOutputNode";

export interface FlowNode {
  id: string;
  type: NodeType;
  data: Record<string, unknown>;
}

export interface FlowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
}

export type NodeOutputs = Map<string, Record<string, unknown>>;

const EXECUTION_NODES = new Set(["generateNode", "editNode", "videoNode", "multiRefNode"]);
const OUTPUT_NODES = new Set(["imageOutputNode", "videoOutputNode"]);
const cancelledRuns = new Set<string>();

// BFS upstream desde un nodo dado
function findUpstreamNodes(
  startId: string,
  nodes: FlowNode[],
  edges: FlowEdge[]
): FlowNode[] {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const visited = new Set<string>();
  const queue = [startId];
  const result: FlowNode[] = [];

  while (queue.length > 0) {
    const id = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);

    const node = nodeMap.get(id);
    if (node) result.push(node);

    // Encontrar nodos que apuntan a este
    edges
      .filter((e) => e.target === id)
      .forEach((e) => queue.push(e.source));
  }

  return result;
}

function findDownstreamNodes(
  startId: string,
  nodes: FlowNode[],
  edges: FlowEdge[]
): FlowNode[] {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const visited = new Set<string>();
  const queue = [startId];
  const result: FlowNode[] = [];

  while (queue.length > 0) {
    const id = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);

    const node = nodeMap.get(id);
    if (node) result.push(node);

    edges
      .filter((e) => e.source === id)
      .forEach((e) => queue.push(e.target));
  }

  return result;
}

// Topological sort (Kahn's algorithm)
function topologicalSort(nodes: FlowNode[], edges: FlowEdge[]): FlowNode[] {
  const nodeIds = new Set(nodes.map((n) => n.id));
  const inEdges = edges.filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target));

  const inDegree = new Map(nodes.map((n) => [n.id, 0]));
  inEdges.forEach((e) => inDegree.set(e.target, (inDegree.get(e.target) || 0) + 1));

  const queue = nodes.filter((n) => inDegree.get(n.id) === 0);
  const sorted: FlowNode[] = [];

  while (queue.length > 0) {
    const node = queue.shift()!;
    sorted.push(node);
    inEdges
      .filter((e) => e.source === node.id)
      .forEach((e) => {
        const deg = (inDegree.get(e.target) || 1) - 1;
        inDegree.set(e.target, deg);
        if (deg === 0) {
          const target = nodes.find((n) => n.id === e.target);
          if (target) queue.push(target);
        }
      });
  }

  return sorted;
}

const MAX_POLL_MS = 12 * 60 * 1000; // 12 minutes — covers Kling video worst case

async function pollProgress(
  generationId: string,
  runId: string,
  onProgress: (pct: number, stage: string) => void,
  onComplete: (result: { image_url?: string; video_url?: string }) => void,
  onError: (msg: string) => void
): Promise<{ image_url?: string; video_url?: string }> {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const interval = setInterval(async () => {
      if (cancelledRuns.has(runId)) {
        clearInterval(interval);
        reject(new Error("Run cancelled"));
        return;
      }
      if (Date.now() - startedAt > MAX_POLL_MS) {
        clearInterval(interval);
        const msg = "Generation timed out after 12 minutes";
        onError(msg);
        reject(new Error(msg));
        return;
      }
      try {
        const data = await requestWithRetry(() =>
          api.get<{
            image_url?: string;
            video_url?: string;
            progress: { status: string; progress_pct: number; stage: string; error_message?: string };
          }>(`/progress/${generationId}`)
        );

        const { status, progress_pct, stage, error_message } = data.progress;
        onProgress(progress_pct, stage);

        if (status === "completed") {
          clearInterval(interval);
          onComplete(data);
          resolve(data);
        } else if (status === "failed") {
          clearInterval(interval);
          onError(error_message || "Generation failed");
          reject(new Error(error_message || "Generation failed"));
        }
      } catch (err) {
        clearInterval(interval);
        reject(err);
      }
    }, 1500);
  });
}

// Resuelve los inputs de un nodo desde los outputs de nodos anteriores
function resolveInputs(
  node: FlowNode,
  edges: FlowEdge[],
  outputs: NodeOutputs
): Record<string, unknown> {
  const inputs: Record<string, unknown> = { ...node.data };

  edges
    .filter((e) => e.target === node.id)
    .forEach((e) => {
      const sourceOutputs = outputs.get(e.source) || {};
      const handle = e.targetHandle || "input";
      const value = sourceOutputs[e.sourceHandle || "output"];
      if (value !== undefined) {
        inputs[handle] = value;
      }
    });

  return inputs;
}

export interface ExecutorCallbacks {
  onNodeStart: (nodeId: string) => void;
  onNodeProgress: (nodeId: string, pct: number, stage: string) => void;
  onNodeComplete: (nodeId: string, outputs: Record<string, unknown>) => void;
  onNodeError: (nodeId: string, error: string) => void;
}

export interface ExecuteOptions {
  runId?: string;
  retryCount?: number;
  /**
   * Optional cache: if provided, upstream nodes that are NOT the target will
   * skip re-execution and use the cached output instead.
   * Return `undefined` to force re-run for that node.
   * Pass `undefined` for this entire option to disable caching (full pipeline run).
   */
  getCachedOutput?: (nodeId: string) => unknown | undefined;
}

function findPipelineTargets(nodes: FlowNode[], edges: FlowEdge[]): FlowNode[] {
  const outputNodes = nodes.filter((n) => OUTPUT_NODES.has(n.type));
  if (outputNodes.length > 0) {
    return outputNodes;
  }

  const sourceIds = new Set(edges.map((e) => e.source));
  return nodes.filter((n) => EXECUTION_NODES.has(n.type) && !sourceIds.has(n.id));
}

function createRunId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `run_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function isTransientError(error: unknown): boolean {
  const text = error instanceof Error ? error.message : String(error);
  return (
    text.includes("Failed to fetch") ||
    text.includes("NetworkError") ||
    text.includes("502") ||
    text.includes("503") ||
    text.includes("504") ||
    text.includes("timeout")
  );
}

async function requestWithRetry<T>(request: () => Promise<T>, retryCount = 2): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retryCount; attempt += 1) {
    try {
      return await request();
    } catch (error) {
      lastError = error;
      if (attempt === retryCount || !isTransientError(error)) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
    }
  }
  throw lastError;
}

export function cancelRun(runId: string): void {
  if (!runId) return;
  cancelledRuns.add(runId);
}

export async function executePipeline(
  nodes: FlowNode[],
  edges: FlowEdge[],
  callbacks: ExecutorCallbacks,
  options: ExecuteOptions = {}
): Promise<string> {
  const runId = options.runId || createRunId();
  const retryCount = options.retryCount ?? 2;
  const targets = findPipelineTargets(nodes, edges);

  if (targets.length === 0) {
    throw new Error("Pipeline has no executable target nodes");
  }

  // Track outputs across targets so shared upstream nodes (e.g. Generate feeding two branches)
  // are executed only once even when executePipeline processes multiple targets.
  const sharedOutputs: NodeOutputs = new Map();

  const getCachedFromShared = (nodeId: string) => {
    const cached = sharedOutputs.get(nodeId);
    return cached ? cached.output : undefined;
  };

  const wrappedCallbacks: ExecutorCallbacks = {
    ...callbacks,
    onNodeComplete: (nid, outputs) => {
      sharedOutputs.set(nid, outputs); // cache for subsequent targets
      callbacks.onNodeComplete(nid, outputs);
    },
  };

  for (const target of targets) {
    if (cancelledRuns.has(runId)) break;
    await executeNode(target.id, nodes, edges, wrappedCallbacks, {
      runId,
      retryCount,
      // For the full pipeline: share outputs across targets but always re-run the immediate target
      getCachedOutput: (nodeId) => nodeId === target.id ? undefined : getCachedFromShared(nodeId),
    });
  }

  return runId;
}

export async function executeNode(
  targetNodeId: string,
  nodes: FlowNode[],
  edges: FlowEdge[],
  callbacks: ExecutorCallbacks,
  options: ExecuteOptions = {}
): Promise<string> {
  const runId = options.runId || createRunId();
  const retryCount = options.retryCount ?? 2;
  cancelledRuns.delete(runId);

  // Ejecuta un subgrafo completo: upstream del target + downstream del target y sus dependencias.
  const downstream = findDownstreamNodes(targetNodeId, nodes, edges);
  const included = new Set<string>();

  downstream.forEach((node) => {
    findUpstreamNodes(node.id, nodes, edges).forEach((up) => included.add(up.id));
  });
  included.add(targetNodeId);

  const scopedNodes = nodes.filter((n) => included.has(n.id));
  const scopedEdges = edges.filter((e) => included.has(e.source) && included.has(e.target));

  const sorted = topologicalSort(scopedNodes, scopedEdges);
  const outputs: NodeOutputs = new Map();

  for (const node of sorted) {
    if (cancelledRuns.has(runId)) {
      callbacks.onNodeError(node.id, "Run cancelled");
      break;
    }

    // Cache: upstream nodes (not the direct target) can reuse a previous output
    // rather than making a redundant API call. Callers opt in by passing getCachedOutput.
    if (node.id !== targetNodeId && options.getCachedOutput) {
      const cached = options.getCachedOutput(node.id);
      if (cached !== undefined) {
        outputs.set(node.id, { output: cached });
        continue; // skip API call — reuse cached output
      }
    }

    const inputs = resolveInputs(node, scopedEdges, outputs);
    callbacks.onNodeStart(node.id);

    try {
      const nodeOutputs = await executeOneNode(node, inputs, callbacks, runId, retryCount);
      outputs.set(node.id, nodeOutputs);
      callbacks.onNodeComplete(node.id, nodeOutputs);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      callbacks.onNodeError(node.id, msg);
      break; // Detener la cadena
    }
  }

  return runId;
}

function requireStringInput(value: unknown, message: string): string {
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }
  throw new Error(message);
}

function extractReferenceUrls(inputs: Record<string, unknown>): string[] {
  const refs: string[] = [];

  for (let i = 0; i < 8; i += 1) {
    const value = inputs[`ref_${i}`];
    if (typeof value === "string" && value.trim()) refs.push(value.trim());
  }

  if (Array.isArray(inputs.refs)) {
    for (const value of inputs.refs) {
      if (typeof value === "string" && value.trim()) refs.push(value.trim());
    }
  }

  return Array.from(new Set(refs));
}

async function executeOneNode(
  node: FlowNode,
  inputs: Record<string, unknown>,
  callbacks: ExecutorCallbacks,
  runId: string,
  retryCount: number
): Promise<Record<string, unknown>> {
  switch (node.type) {
    case "promptNode":
      return { output: inputs.prompt || inputs.text || "" };

    case "modelSelectorNode":
      return { output: inputs.config ?? {} };

    case "generateNode": {
      const prompt = requireStringInput(inputs.prompt, "Generate node requires a prompt input");
      const res = await requestWithRetry(
        () =>
          api.post<{ generation_id: string }>("/generate", {
            prompt,
            model_config_id: (inputs.config as { id?: string })?.id,
            workflow_id: inputs.workflow_id,
            run_id: runId,
          }),
        retryCount
      );
      const result = await pollProgress(
        res.generation_id,
        runId,
        (pct, stage) => callbacks.onNodeProgress(node.id, pct, stage),
        () => {},
        () => {}
      );
      return { output: result.image_url };
    }

    case "editNode": {
      const imageUrl = requireStringInput(inputs.image || inputs.input, "Edit node requires an image input");
      const prompt = requireStringInput(inputs.prompt, "Edit node requires a prompt input");
      const res = await requestWithRetry(
        () =>
          api.post<{ generation_id: string }>("/edit", {
            image_url: imageUrl,
            prompt,
            model_config_id: (inputs.config as { id?: string })?.id,
            workflow_id: inputs.workflow_id,
            run_id: runId,
          }),
        retryCount
      );
      const result = await pollProgress(
        res.generation_id,
        runId,
        (pct, stage) => callbacks.onNodeProgress(node.id, pct, stage),
        () => {},
        () => {}
      );
      return { output: result.image_url };
    }

    case "videoNode": {
      const imageUrl = requireStringInput(inputs.image || inputs.input, "Video node requires an image input");
      const res = await requestWithRetry(
        () =>
          api.post<{ generation_id: string }>("/video", {
            image_url: imageUrl,
            prompt: typeof inputs.prompt === "string" ? inputs.prompt : "",
            model_config_id: (inputs.config as { id?: string })?.id,
            workflow_id: inputs.workflow_id,
            run_id: runId,
          }),
        retryCount
      );
      const result = await pollProgress(
        res.generation_id,
        runId,
        (pct, stage) => callbacks.onNodeProgress(node.id, pct, stage),
        () => {},
        () => {}
      );
      return { output: result.video_url };
    }

    case "multiRefNode": {
      const prompt = requireStringInput(inputs.prompt, "Multi-Ref node requires a prompt input");
      const modelConfigId = (inputs.config as { id?: string })?.id;
      if (typeof modelConfigId !== "string" || modelConfigId.trim().length === 0) {
        throw new Error("Multi-Ref node requires a model configuration");
      }
      const refs = extractReferenceUrls(inputs);
      if (refs.length > 8) {
        throw new Error("Multi-Ref node supports up to 8 reference image URLs");
      }
      const res = await requestWithRetry(
        () =>
          api.post<{ generation_id: string }>("/generate-multi-ref", {
            prompt,
            reference_urls: refs,
            model_config_id: modelConfigId,
            workflow_id: inputs.workflow_id,
            run_id: runId,
          }),
        retryCount
      );
      const result = await pollProgress(
        res.generation_id,
        runId,
        (pct, stage) => callbacks.onNodeProgress(node.id, pct, stage),
        () => {},
        () => {}
      );
      return { output: result.image_url };
    }

    case "imageOutputNode":
    case "videoOutputNode":
      return { output: inputs.input || inputs.image || inputs.video };

    default:
      return inputs;
  }
}
