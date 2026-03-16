"use client";
import { useEffect, useState } from "react";
import { useCanvasStore } from "@/store/canvas";
import { useAuthStore } from "@/store/auth";
import { api } from "@/lib/api";

interface ProjectItem {
  id: string;
  name: string;
}

export function ProjectSelector() {
  const { globalProjectId, setGlobalProjectId, nodes, setNodes } = useCanvasStore();
  const session = useAuthStore((s) => s.session);
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    api.get<{ projects: ProjectItem[] }>("/projects")
      .then((r) => { if (!cancelled) setProjects(r.projects || []); })
      .catch(() => { if (!cancelled) setProjects([]); });
    return () => { cancelled = true; };
  }, [session]);

  const applyToModels = () => {
    if (!globalProjectId.trim()) return;
    setNodes(
      nodes.map((node) =>
        node.type === "modelSelectorNode"
          ? { ...node, data: { ...(node.data || {}), project_id: globalProjectId.trim() } }
          : node
      )
    );
  };

  const createProject = async () => {
    if (!newName.trim()) return;
    try {
      const res = await api.post<{ id: string; name: string }>("/projects", { name: newName.trim() });
      setProjects((prev) => [res, ...prev]);
      setGlobalProjectId(res.id);
      setNewName("");
      setCreating(false);
    } catch {
      // silent
    }
  };

  return (
    <div className="flex items-center gap-2">
      <select
        className="bg-neutral-800 text-neutral-200 border border-neutral-700 rounded px-2 py-1 text-xs max-w-[160px]"
        value={globalProjectId}
        onChange={(e) => {
          if (e.target.value === "__new__") { setCreating(true); return; }
          setGlobalProjectId(e.target.value);
        }}
      >
        <option value="">No project</option>
        {projects.map((p) => (
          <option key={p.id} value={p.id}>{p.name}</option>
        ))}
        <option value="__new__">+ New project</option>
      </select>

      {creating && (
        <div className="flex items-center gap-1">
          <input
            autoFocus
            className="bg-neutral-800 text-neutral-200 border border-neutral-700 rounded px-2 py-1 text-xs w-28"
            placeholder="Project name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void createProject(); if (e.key === "Escape") setCreating(false); }}
          />
          <button
            onClick={() => void createProject()}
            className="px-2 py-1 text-xs bg-blue-700 hover:bg-blue-600 text-white rounded transition"
          >
            Create
          </button>
          <button
            onClick={() => setCreating(false)}
            className="px-2 py-1 text-xs bg-neutral-800 hover:bg-neutral-700 text-neutral-400 rounded transition"
          >
            ✕
          </button>
        </div>
      )}

      {!creating && globalProjectId && (
        <button
          onClick={applyToModels}
          className="px-2 py-1 text-xs bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded border border-neutral-700 transition"
        >
          Apply
        </button>
      )}
    </div>
  );
}
