import { Check } from "lucide-react";

interface Step {
  label: string;
}

interface StagesStepperProps {
  steps: Step[];
  currentIndex: number;
}

export function StagesStepper({ steps, currentIndex }: StagesStepperProps) {
  return (
    <div className="flex items-center gap-0">
      {steps.map((step, i) => {
        const isDone = i < currentIndex;
        const isActive = i === currentIndex;
        return (
          <div key={step.label} className="flex items-center">
            {/* Circle */}
            <div
              className={[
                "flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold shrink-0 transition-colors",
                isDone
                  ? "bg-emerald-500 text-white"
                  : isActive
                  ? "bg-indigo-500 text-white ring-2 ring-indigo-400 ring-offset-2 ring-offset-neutral-900"
                  : "bg-neutral-700 text-neutral-400",
              ].join(" ")}
            >
              {isDone ? <Check size={13} strokeWidth={3} /> : i + 1}
            </div>

            {/* Label (only on md+) */}
            <span
              className={[
                "hidden sm:block ml-2 text-xs font-medium",
                isActive ? "text-white" : isDone ? "text-emerald-400" : "text-neutral-500",
              ].join(" ")}
            >
              {step.label}
            </span>

            {/* Connector line */}
            {i < steps.length - 1 && (
              <div
                className={[
                  "w-8 sm:w-12 h-px mx-2 sm:mx-3",
                  i < currentIndex ? "bg-emerald-500" : "bg-neutral-700",
                ].join(" ")}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
