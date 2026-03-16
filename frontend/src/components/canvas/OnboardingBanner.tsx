"use client";
import { useState, useEffect } from "react";
import { useCanvasStore } from "@/store/canvas";
import { X, PenLine, Play, ImageIcon } from "lucide-react";

interface Step {
  icon: React.ReactNode;
  label: string;
  hint: string;
}

const STEPS: Step[] = [
  {
    icon: <PenLine size={13} className="text-yellow-400" />,
    label: "Edit the prompt",
    hint: "Click the text area and describe what you want",
  },
  {
    icon: <Play size={13} className="text-blue-400" />,
    label: "Click Run Pipeline",
    hint: "Press the blue button in the top bar",
  },
  {
    icon: <ImageIcon size={13} className="text-green-400" />,
    label: "See your result",
    hint: "The image appears in the Output node",
  },
];

interface OnboardingBannerProps {
  visible: boolean;
  onDismiss: () => void;
}

export function OnboardingBanner({ visible, onDismiss }: OnboardingBannerProps) {
  const nodeStates = useCanvasStore((s) => s.nodeStates);
  const nodes = useCanvasStore((s) => s.nodes);
  const [hovered, setHovered] = useState<number | null>(null);

  if (!visible) return null;

  const hasAnyRunning = Object.values(nodeStates).some((s) => s.status === "running");
  const hasAnyComplete = Object.values(nodeStates).some((s) => s.status === "complete");

  // Determine active step
  const activeStep = hasAnyComplete ? 2 : hasAnyRunning ? 1 : 0;

  // Auto-dismiss after completion — must be in useEffect to avoid re-creating timers on every render
  useEffect(() => {
    if (!hasAnyComplete) return;
    const t = setTimeout(onDismiss, 3500);
    return () => clearTimeout(t);
  }, [hasAnyComplete, onDismiss]);

  return (
    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 pointer-events-none">
      <div className="flex items-center gap-1 bg-neutral-900/95 border border-neutral-700 rounded-2xl px-4 py-2.5 shadow-xl pointer-events-auto">

        {STEPS.map((step, i) => {
          const isActive = i === activeStep;
          const isDone = i < activeStep;
          const isLast = i === STEPS.length - 1;

          return (
            <div key={i} className="flex items-center gap-1">
              {/* Step */}
              <div
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg transition-all cursor-default
                  ${isActive ? "bg-neutral-800 ring-1 ring-neutral-600" : ""}
                  ${isDone ? "opacity-40" : ""}
                `}
                onMouseEnter={() => setHovered(i)}
                onMouseLeave={() => setHovered(null)}
              >
                {isDone ? (
                  <span className="text-green-500 text-xs">✓</span>
                ) : (
                  step.icon
                )}
                <span className={`text-xs ${isActive ? "text-white" : "text-neutral-500"}`}>
                  <span className="text-neutral-600 mr-1">{i + 1}.</span>
                  {step.label}
                </span>
              </div>

              {/* Tooltip */}
              {hovered === i && isActive && (
                <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 bg-neutral-800 border border-neutral-700 text-neutral-300 text-xs rounded-lg px-3 py-1.5 whitespace-nowrap shadow-lg">
                  {step.hint}
                </div>
              )}

              {/* Connector */}
              {!isLast && (
                <span className="text-neutral-700 text-xs px-0.5">→</span>
              )}
            </div>
          );
        })}

        {/* Dismiss */}
        <button
          type="button"
          onClick={onDismiss}
          className="ml-2 text-neutral-700 hover:text-neutral-400 transition"
          title="Dismiss"
        >
          <X size={13} />
        </button>

      </div>
    </div>
  );
}
