"use client";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import type { Edge, Node } from "@xyflow/react";
import { AuthGuard } from "@/components/auth/AuthGuard";
import { UserMenu } from "@/components/auth/UserMenu";
import { Canvas } from "@/components/canvas/Canvas";
import { Toolbar } from "@/components/canvas/Toolbar";
import { WorkflowControls } from "@/components/canvas/WorkflowControls";
import { ProjectSelector } from "@/components/canvas/ProjectSelector";
import { RunPipelineButton } from "@/components/canvas/RunPipelineButton";
import { DemoTemplateButton } from "@/components/canvas/DemoTemplateButton";
import { WelcomeOverlay } from "@/components/canvas/WelcomeOverlay";
import { OnboardingBanner } from "@/components/canvas/OnboardingBanner";
import { useCanvasStore } from "@/store/canvas";
import { api } from "@/lib/api";
import Link from "next/link";
import { LayoutGrid, FilePlus, Clock } from "lucide-react";

interface WorkflowPayload {
  id: string;
  name: string;
  project_id?: string | null;
  graph_json: {
    nodes?: Node[];
    edges?: Edge[];
  };
}

function CanvasPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const requestedWorkflowId = searchParams.get("workflow");
  const loadGraph = useCanvasStore((s) => s.loadGraph);

  const [workflowId, setWorkflowId] = useState<string | undefined>();
  const [workflowName, setWorkflowName] = useState("Untitled Workflow");
  const [overlayDismissed, setOverlayDismissed] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [demoLoaded, setDemoLoaded] = useState(false);
  const nodes = useCanvasStore((s) => s.nodes);
  const showOverlay = !overlayDismissed && !requestedWorkflowId && nodes.length === 0;

  useEffect(() => {
    if (nodes.length > 0) {
      setOverlayDismissed(true);
    }
  }, [nodes.length]);

  const handleNewWorkflow = () => {
    loadGraph([], []);
    setWorkflowId(undefined);
    setWorkflowName("Untitled Workflow");
    setOverlayDismissed(false);
    router.replace("/canvas");
  };

  const handleWorkflowSaved = (id: string) => {
    setWorkflowId(id);
    // Update URL so bookmarking/sharing loads this workflow
    router.replace(`/canvas?workflow=${id}`);
  };

  useEffect(() => {
    if (!requestedWorkflowId) return;

    let cancelled = false;

    const loadFromUrl = async () => {
      try {
        const wf = await api.get<WorkflowPayload>(`/workflows/${requestedWorkflowId}`);
        if (cancelled) return;
        const hydratedNodes = (wf.graph_json?.nodes ?? []).map((node) => {
          if (node.type === "modelSelectorNode" && wf.project_id) {
            return {
              ...node,
              data: {
                ...(node.data || {}),
                project_id: (node.data as { project_id?: string })?.project_id || wf.project_id,
              },
            };
          }
          return node;
        });

        loadGraph(hydratedNodes, wf.graph_json?.edges ?? []);
        setWorkflowId(wf.id);
        setWorkflowName(wf.name || "Untitled Workflow");
      } catch (error) {
        console.error("Failed to load workflow from URL:", error);
      }
    };

    void loadFromUrl();

    return () => {
      cancelled = true;
    };
  }, [requestedWorkflowId, loadGraph]);

  return (
    <AuthGuard>
      <div className="flex flex-col h-screen">
        {/* Header */}
        <header className="flex items-center justify-between px-4 py-2 bg-neutral-900 border-b border-neutral-800 z-20">
          <div className="flex items-center gap-4">
            <span className="font-semibold text-sm text-white">Canvas</span>
            <Link
              href="/workflows"
              className="flex items-center gap-1.5 text-xs text-neutral-500 hover:text-neutral-300 transition"
            >
              <LayoutGrid size={12} />
              My Workflows
            </Link>
            <Link
              href="/generations"
              className="flex items-center gap-1.5 text-xs text-neutral-500 hover:text-neutral-300 transition"
            >
              <Clock size={12} />
              History
            </Link>
            <button
              type="button"
              onClick={handleNewWorkflow}
              title="New workflow"
              className="flex items-center gap-1 px-2 py-1 text-xs text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 rounded transition"
            >
              <FilePlus size={12} />
              New
            </button>
            <ProjectSelector />
            <DemoTemplateButton />
            <RunPipelineButton />
          </div>
          <WorkflowControls
            workflowId={workflowId}
            initialName={workflowName}
            onSaved={handleWorkflowSaved}
          />
          <UserMenu />
        </header>

        {/* Canvas */}
        <div className="flex-1 relative">
          <Toolbar />
          <Canvas />
          <WelcomeOverlay
            visible={showOverlay}
            onDismiss={(loadedDemo?: boolean) => {
              setOverlayDismissed(true);
              if (loadedDemo) setDemoLoaded(true);
            }}
          />
          <OnboardingBanner
            visible={demoLoaded && !bannerDismissed && !showOverlay}
            onDismiss={() => setBannerDismissed(true)}
          />
        </div>
      </div>
    </AuthGuard>
  );
}

export default function CanvasPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center h-screen bg-neutral-950">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-white" />
        </div>
      }
    >
      <CanvasPageContent />
    </Suspense>
  );
}
