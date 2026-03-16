"use client";
import { useEffect, useState } from "react";
import { AuthGuard } from "@/components/auth/AuthGuard";
import { api } from "@/lib/api";
import Link from "next/link";
import { ArrowLeft, Clock, Globe } from "lucide-react";

interface Workflow {
  id: string;
  name: string;
  is_public: boolean;
  updated_at: string;
}

export default function WorkflowsPage() {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<{ workflows: Workflow[] }>("/workflows")
      .then((r) => setWorkflows(r.workflows))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  return (
    <AuthGuard>
      <div className="min-h-screen bg-neutral-950 p-6">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center gap-4 mb-8">
            <Link href="/canvas" className="text-neutral-500 hover:text-neutral-300 transition">
              <ArrowLeft size={18} />
            </Link>
            <h1 className="text-xl font-semibold text-white">My Workflows</h1>
          </div>

          {loading ? (
            <div className="grid grid-cols-3 gap-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-32 bg-neutral-900 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : workflows.length === 0 ? (
            <div className="text-center py-20">
              <p className="text-neutral-600 mb-4">No workflows saved yet</p>
              <Link href="/canvas" className="text-sm text-blue-400 hover:text-blue-300 transition">
                Start creating →
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {workflows.map((wf) => (
                <Link
                  key={wf.id}
                  href={`/canvas?workflow=${wf.id}`}
                  className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 hover:border-neutral-600 transition group"
                >
                  <div className="flex items-start justify-between mb-3">
                    <span className="font-medium text-white text-sm group-hover:text-blue-400 transition">
                      {wf.name}
                    </span>
                    {wf.is_public && (
                      <Globe size={12} className="text-neutral-600" />
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-neutral-600">
                    <Clock size={10} />
                    {new Date(wf.updated_at).toLocaleDateString()}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </AuthGuard>
  );
}
