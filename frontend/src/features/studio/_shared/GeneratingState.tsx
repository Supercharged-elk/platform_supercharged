interface GeneratingStateProps {
  message?: string;
  subMessage?: string;
}

export function GeneratingState({
  message = "Generating…",
  subMessage,
}: GeneratingStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-10">
      <div className="relative w-10 h-10">
        <div className="absolute inset-0 rounded-full border-2 border-neutral-700" />
        <div className="absolute inset-0 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
      </div>
      <p className="text-sm text-neutral-300 font-medium">{message}</p>
      {subMessage && <p className="text-xs text-neutral-500">{subMessage}</p>}
    </div>
  );
}
