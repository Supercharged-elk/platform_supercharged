"use client";
import { useEffect, useCallback, useState } from "react";
import { useCanvasStore } from "@/store/canvas";
import { api } from "@/lib/api";
import { Save, Loader2, CheckCircle, Globe, Lock, Copy } from "lucide-react";

interface WorkflowControlsProps {
  workflowId?: string;
  initialName?: string;
  onSaved?: (id: string) => void;
}

function detectProjectIdFromGraph(nodes: Array<{ data?: Record<string, unknown> }>): string | null {
  for (const node of nodes) {
    const projectId = node.data?.project_id;
    if (typeof projectId === "string" && projectId.trim()) {
      return projectId.trim();
    }
  }
  return null;
}

export function WorkflowControls({ workflowId, initialName, onSaved }: WorkflowControlsProps) {
  const { nodes, edges, isDirty, markSaved } = useCanvasStore();
  const defaultName = initialName || "Untitled Workflow";
  const [name, setName] = useState(defaultName);
  const [savedName, setSavedName] = useState(defaultName);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [isPublic, setIsPublic] = useState(false);
  const [copyDone, setCopyDone] = useState(false);
  const hasNameChanges = name.trim() !== savedName.trim();
  const hasPendingChanges = isDirty || hasNameChanges;

  useEffect(() => {
    if (initialName) {
      setName(initialName);
      setSavedName(initialName);
    }
  }, [initialName]);

  const save = useCallback(async () => {
    setSaving(true);
    try {
      const graph_json = { nodes, edges };
      const project_id = detectProjectIdFromGraph(nodes as Array<{ data?: Record<string, unknown> }>) || undefined;
      let res: { id: string };

      if (workflowId) {
        res = await api.patch<{ id: string }>(`/workflows/${workflowId}`, { name, graph_json, project_id, is_public: isPublic });
      } else {
        res = await api.post<{ id: string }>("/workflows", { name, graph_json, project_id, is_public: isPublic });
        onSaved?.(res.id);
      }

      markSaved();
      setSavedName(name);
      setSavedAt(new Date());
    } catch (err) {
      console.error("Save failed:", err);
    } finally {
      setSaving(false);
    }
  }, [nodes, edges, name, isPublic, workflowId, markSaved, onSaved]);

  const toggleShare = useCallback(async () => {
    if (!workflowId) return;
    const next = !isPublic;
    setIsPublic(next);
    try {
      await api.patch(`/workflows/${workflowId}`, {
        name,
        graph_json: { nodes, edges },
        is_public: next,
      });
    } catch {
      setIsPublic(!next); // revert only if the PATCH itself fails
      return;
    }
    // Clipboard write is best-effort — failure must NOT revert the share state
    if (next) {
      try {
        await navigator.clipboard.writeText(`${window.location.origin}/canvas?workflow=${workflowId}`);
        setCopyDone(true);
        setTimeout(() => setCopyDone(false), 2000);
      } catch {
        // Clipboard unavailable (headless browser, permissions) — share state already saved
      }
    }
  }, [workflowId, isPublic, name, nodes, edges]);

  // Cmd+S / Ctrl+S
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        save();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [save]);

  return (
    <div className="flex items-center gap-2">
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="bg-transparent text-sm text-neutral-300 border-b border-neutral-700 focus:outline-none focus:border-neutral-500 px-1 w-40"
      />
      {hasPendingChanges && (
        <span className="w-1.5 h-1.5 rounded-full bg-yellow-500" title="Unsaved changes" />
      )}
      {workflowId && (
        <button
          type="button"
          onClick={toggleShare}
          title={isPublic ? (copyDone ? "Link copied!" : "Public — click to make private") : "Make public & copy link"}
          className={`flex items-center gap-1 px-2 py-1.5 text-xs rounded-lg transition ${
            isPublic
              ? "bg-green-900/40 border border-green-700 text-green-400 hover:bg-green-900/60"
              : "bg-neutral-800 hover:bg-neutral-700 text-neutral-500 hover:text-neutral-300"
          }`}
        >
          {isPublic ? (
            copyDone ? <Copy size={11} className="text-green-400" /> : <Globe size={11} />
          ) : (
            <Lock size={11} />
          )}
        </button>
      )}
      <button
        onClick={save}
        disabled={saving}
        className="flex items-center gap-1.5 px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50 text-white text-xs rounded-lg transition"
      >
        {saving ? (
          <Loader2 size={12} className="animate-spin" />
        ) : savedAt && !hasPendingChanges ? (
          <CheckCircle size={12} className="text-green-400" />
        ) : (
          <Save size={12} />
        )}
        Save
      </button>
    </div>
  );
}
