"use client";
import { useState, useEffect } from "react";
import { Upload } from "lucide-react";

interface ImageUploaderProps {
  label?: string;
  accept?: string;
  multiple?: boolean;
  onFiles: (files: File[]) => void;
  className?: string;
}

export function ImageUploader({
  label = "Click or drag & drop to upload",
  accept = "image/*",
  multiple = false,
  onFiles,
  className = "",
}: ImageUploaderProps) {
  const [dragging, setDragging] = useState(false);
  // Defer file input rendering until after React hydration so event handlers are ready
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const handle = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    onFiles(Array.from(files));
  };

  return (
    <div
      className={[
        "relative flex flex-col items-center justify-center gap-3 p-8 rounded-xl border-2 border-dashed cursor-pointer transition-colors",
        dragging
          ? "border-indigo-400 bg-indigo-500/10"
          : "border-neutral-700 bg-neutral-800/50 hover:border-neutral-500",
        className,
      ].join(" ")}
      onDragEnter={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={(e) => { e.preventDefault(); setDragging(false); }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        handle(e.dataTransfer.files);
      }}
    >
      <Upload size={28} className="text-neutral-400 pointer-events-none" />
      <p className="text-sm text-neutral-400 text-center pointer-events-none">{label}</p>
      {/* Render after hydration so React event handlers are attached when Playwright interacts */}
      {mounted && (
        <input
          type="file"
          accept={accept}
          multiple={multiple}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          onChange={(e) => handle(e.target.files)}
        />
      )}
    </div>
  );
}
