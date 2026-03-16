"use client";
import { useRealFootage } from "./hooks/useRealFootage";
import { StagesStepper } from "../_shared/StagesStepper";
import { Stage1Creative } from "./stages/Stage1Creative";
import { Stage2Actions } from "./stages/Stage2Actions";
import { Stage3Keyframes } from "./stages/Stage3Keyframes";
import { Stage4Videos } from "./stages/Stage4Videos";
import { RotateCcw } from "lucide-react";
import { StorageWarning } from "../_shared/StorageWarning";

const STEPS = [
  { label: "Upload & Analyze" },
  { label: "Review Actions" },
  { label: "Generate Keyframes" },
  { label: "Animate Videos" },
];

const STAGE_INDEX: Record<string, number> = {
  upload: 0,
  actions: 1,
  keyframes: 2,
  videos: 3,
};

export function RealFootageFlow() {
  const { stage, reset } = useRealFootage();
  const currentIndex = STAGE_INDEX[stage] ?? 0;

  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      <StorageWarning />
      {/* Header */}
      <div className="sticky top-0 z-10 bg-neutral-950/95 backdrop-blur border-b border-neutral-800 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-base font-semibold text-white">Real Footage Pipeline</h1>
            <p className="text-xs text-neutral-500">Video → Analysis → Keyframes → Animation</p>
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
        {stage === "upload" && <Stage1Creative />}
        {stage === "actions" && <Stage2Actions />}
        {stage === "keyframes" && <Stage3Keyframes />}
        {stage === "videos" && <Stage4Videos />}
      </div>
    </div>
  );
}
