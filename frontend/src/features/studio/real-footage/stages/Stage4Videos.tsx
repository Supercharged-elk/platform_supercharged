"use client";
import { useState } from "react";
import { Download, RefreshCw, Video, Play, ArrowLeft } from "lucide-react";
import { useRealFootage } from "../hooks/useRealFootage";
import { GeneratingState } from "../../_shared/GeneratingState";
import { ErrorBlock } from "../../_shared/ErrorBlock";
import { base64ToDataUrl, downloadAsZip } from "../../_shared/utils";

export function Stage4Videos() {
  const { videos, generateVideo, generateAllVideos, goBack } = useRealFootage();

  // Local per-card editable prompts — initialized from vid.videoPrompt
  const [localPrompts, setLocalPrompts] = useState<Record<string, string>>(() =>
    Object.fromEntries(videos.map((v) => [v.id, v.videoPrompt]))
  );

  const doneCount = videos.filter((v) => v.status === "done").length;
  const anyGenerating = videos.some((v) => v.status === "generating");

  const setLocalPrompt = (id: string, value: string) =>
    setLocalPrompts((prev) => ({ ...prev, [id]: value }));

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <Video size={18} className="text-indigo-400" />
            Animate Keyframes
          </h2>
          <p className="text-sm text-neutral-400 mt-1">
            Each keyframe is animated into a 5-second video clip using Kling AI.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {doneCount > 0 && (
            <button
              type="button"
              onClick={() => {
                const done = videos.filter((v) => v.status === "done" && v.videoUrl);
                void downloadAsZip(
                  done.map((v) => ({ url: v.videoUrl! })),
                  done.map((_, i) => `video-${i + 1}.mp4`),
                  "videos.zip"
                );
              }}
              className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-neutral-700 hover:bg-neutral-600 text-neutral-200 transition"
            >
              <Download size={14} />
              Download All ({doneCount})
            </button>
          )}
          <button
            type="button"
            onClick={() => void generateAllVideos()}
            disabled={anyGenerating}
            className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition disabled:opacity-50"
          >
            <Play size={14} />
            Generate All
          </button>
        </div>
      </div>

      {doneCount === videos.length && doneCount > 0 && (
        <div className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-900/60 text-sm text-emerald-300">
          All {doneCount} video{doneCount !== 1 ? "s" : ""} generated successfully.
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {videos.map((vid) => (
          <div key={vid.id} className="bg-neutral-800 rounded-xl border border-neutral-700 overflow-hidden">
            {/* Media area */}
            <div className="aspect-video bg-neutral-900 flex items-center justify-center relative">
              {vid.status === "generating" && (
                <GeneratingState message="Animating…" subMessage="Kling AI — up to 3 minutes" />
              )}
              {vid.status === "done" && vid.videoUrl && (
                <video
                  src={vid.videoUrl}
                  controls
                  loop
                  className="w-full h-full object-cover"
                  playsInline
                />
              )}
              {vid.status === "idle" && (
                <img
                  src={base64ToDataUrl(vid.base64, "image/jpeg")}
                  alt="Keyframe"
                  className="w-full h-full object-cover opacity-50"
                />
              )}
              {vid.status === "error" && (
                <div className="p-3 w-full">
                  <ErrorBlock
                    message={vid.error ?? "Video generation failed"}
                    onRetry={() => void generateVideo(vid.id, localPrompts[vid.id])}
                  />
                </div>
              )}

              {/* Action buttons overlay */}
              {vid.status === "done" && vid.videoUrl && (
                <div className="absolute top-2 right-2 flex gap-1">
                  <a
                    href={vid.videoUrl}
                    download
                    className="p-1.5 rounded-lg bg-black/60 hover:bg-black/80 text-white transition"
                    title="Download video"
                  >
                    <Download size={13} />
                  </a>
                  <button
                    type="button"
                    onClick={() => void generateVideo(vid.id, localPrompts[vid.id])}
                    className="p-1.5 rounded-lg bg-black/60 hover:bg-black/80 text-white transition"
                    title="Regenerate"
                  >
                    <RefreshCw size={13} />
                  </button>
                </div>
              )}
            </div>

            {/* Editable prompt + generate button */}
            <div className="p-3 space-y-2">
              <textarea
                value={localPrompts[vid.id] ?? vid.videoPrompt}
                onChange={(e) => setLocalPrompt(vid.id, e.target.value)}
                className="w-full text-xs bg-neutral-900 border border-neutral-700 rounded-lg p-2 text-neutral-300 resize-none focus:outline-none focus:border-indigo-500 nodrag nowheel"
                rows={2}
                placeholder="Describe the animation…"
              />
              {vid.status === "idle" && (
                <button
                  type="button"
                  onClick={() => void generateVideo(vid.id, localPrompts[vid.id])}
                  className="w-full py-1.5 text-xs rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition"
                >
                  Generate Video
                </button>
              )}
              {vid.status === "done" && (
                <button
                  type="button"
                  onClick={() => void generateVideo(vid.id, localPrompts[vid.id])}
                  disabled={anyGenerating}
                  className="w-full py-1.5 text-xs rounded-lg bg-neutral-700 hover:bg-neutral-600 text-neutral-200 font-medium transition disabled:opacity-50"
                >
                  Regenerate
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Bottom navigation */}
      <div className="flex items-center justify-between pt-2">
        <div className="space-y-1">
          <button
            type="button"
            onClick={goBack}
            className="flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-300 transition"
          >
            <ArrowLeft size={14} />
            Back to Keyframes
          </button>
          <p className="text-xs text-neutral-600">
            Going back and re-confirming keyframes will clear generated videos.
          </p>
        </div>
      </div>
    </div>
  );
}
