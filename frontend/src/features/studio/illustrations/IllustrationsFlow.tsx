"use client";
import { useIllustrations } from "./hooks/useIllustrations";
import { StagesStepper } from "../_shared/StagesStepper";
import { Stage1Colorize } from "./stages/Stage1Colorize";
import { Stage2Prompts } from "./stages/Stage2Prompts";
import { Stage3Videos } from "./stages/Stage3Videos";
import { RotateCcw } from "lucide-react";
import { StorageWarning } from "../_shared/StorageWarning";

const STEPS = [
  { label: "Colorize Sketches" },
  { label: "Review Prompts" },
  { label: "Generate Videos" },
];

const STAGE_INDEX: Record<string, number> = {
  upload: 0,
  prompts: 1,
  videos: 2,
};

export function IllustrationsFlow() {
  const { stage, reset } = useIllustrations();
  const currentIndex = STAGE_INDEX[stage] ?? 0;

  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      <StorageWarning />
      {/* Header */}
      <div className="sticky top-0 z-10 bg-neutral-950/95 backdrop-blur border-b border-neutral-800 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-base font-semibold text-white">Illustrations Pipeline</h1>
            <p className="text-xs text-neutral-500">B&W Sketch → Colorize → Animate</p>
          </div>
          <StagesStepper steps={STEPS} currentIndex={currentIndex} />
          <button
            type="button"
            onClick={() => {
              if (confirm("Reset this pipeline? All progress will be lost.")) reset();
            }}
            className="flex items-center gap-1.5 text-xs text-neutral-500 hover:text-neutral-300 transition"
          >
            <RotateCcw size={12} />
            Reset
          </button>
        </div>
      </div>

      {/* Stage content */}
      <div className="max-w-4xl mx-auto px-6 py-8">
        {stage === "upload" && <Stage1Colorize />}
        {stage === "prompts" && <Stage2Prompts />}
        {stage === "videos" && <Stage3Videos />}
      </div>
    </div>
  );
}
