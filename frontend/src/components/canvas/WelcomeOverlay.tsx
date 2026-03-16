"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useCanvasStore } from "@/store/canvas";
import { buildSimpleDemoGraph } from "@/components/canvas/demoTemplate";
import { Sparkles, PenLine, LayoutGrid } from "lucide-react";

interface WelcomeOverlayProps {
  visible: boolean;
  onDismiss: (loadedDemo?: boolean) => void;
}

export function WelcomeOverlay({ visible, onDismiss }: WelcomeOverlayProps) {
  const { loadGraph } = useCanvasStore();
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  if (!visible) return null;

  const handleLoadDemo = () => {
    setLoading(true);
    const { nodes, edges } = buildSimpleDemoGraph();
    loadGraph(nodes, edges);
    onDismiss(true); // signal that demo was loaded → show OnboardingBanner
  };

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-neutral-950/75 backdrop-blur-sm">
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl w-[440px]">

        {/* Header */}
        <div className="px-8 pt-8 pb-6 border-b border-neutral-800">
          <h2 className="text-white font-semibold text-lg mb-1">Welcome to Canvas</h2>
          <p className="text-neutral-500 text-sm">
            Build AI image pipelines visually — connect a prompt to a generator and see the result instantly.
          </p>
        </div>

        {/* Demo preview */}
        <div className="px-8 py-5 border-b border-neutral-800">
          <p className="text-xs text-neutral-500 uppercase tracking-wide mb-3">Try the demo — 3 steps</p>
          <div className="flex items-center gap-2 text-sm">
            <div className="flex items-center gap-2 px-3 py-2 bg-neutral-800 rounded-lg">
              <PenLine size={12} className="text-yellow-400" />
              <span className="text-neutral-300 text-xs">Edit prompt</span>
            </div>
            <span className="text-neutral-700">→</span>
            <div className="flex items-center gap-2 px-3 py-2 bg-neutral-800 rounded-lg">
              <Sparkles size={12} className="text-blue-400" />
              <span className="text-neutral-300 text-xs">Run</span>
            </div>
            <span className="text-neutral-700">→</span>
            <div className="flex items-center gap-2 px-3 py-2 bg-neutral-800 rounded-lg">
              <span className="text-neutral-300 text-xs">🖼 See result</span>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="px-8 py-6 flex flex-col gap-3">
          <button
            type="button"
            onClick={handleLoadDemo}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-medium text-sm rounded-xl transition"
          >
            <Sparkles size={15} />
            Load demo & try it now
          </button>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => onDismiss(false)}
              className="flex-1 px-4 py-2.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-sm rounded-xl transition"
            >
              Start blank
            </button>
            <button
              type="button"
              onClick={() => router.push("/workflows")}
              className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-sm rounded-xl transition"
            >
              <LayoutGrid size={13} />
              My workflows
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
