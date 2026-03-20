"use client";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { IllustrationsStage, ColorizedItem, PromptItem, VideoItem } from "../types";
import { nanoid, fileToBase64, base64ToDataUrl, pLimit } from "../../_shared/utils";
import { colorizeSketch, analyzeWithVision } from "../../_shared/services/gemini";
import { startWavespeedPrediction, pollWavespeedPrediction } from "../../_shared/services/wavespeed";

const WAN_MODEL = "wavespeed-ai/wan-2.2/image-to-video-lora";

const HIGH_NOISE_LORA = "https://huggingface.co/Dantelarroy/mvstyl3-lora/resolve/main/high_noise_lora.safetensors";
const LOW_NOISE_LORA  = "https://huggingface.co/Dantelarroy/mvstyl3-lora/resolve/main/low_noise_lora.safetensors";
const HIGH_NOISE_SCALE = 1.2;
const LOW_NOISE_SCALE  = 0.3;

const DEFAULT_COLORIZE_PROMPT =
  "Colorize this black and white sketch. Preserve the original line art, stroke style, and illustration character exactly — do NOT render it as a photograph or make it photorealistic. Keep it as an illustration. Apply colors that feel natural to the composition.";

function buildColorizePrompt(instruction?: string): string {
  if (instruction && instruction.trim()) {
    return `${DEFAULT_COLORIZE_PROMPT} Additional instructions: ${instruction.trim()}`;
  }
  return DEFAULT_COLORIZE_PROMPT;
}

interface IllustrationsStore {
  stage: IllustrationsStage;
  colorized: ColorizedItem[];
  prompts: PromptItem[];
  videos: VideoItem[];

  // Stage 1
  addSketches: (files: File[]) => Promise<void>;
  setItemInstruction: (id: string, instruction: string) => void;
  setItemReference: (id: string, base64: string, mimeType: string) => void;
  removeItemReference: (id: string) => void;
  colorizeItem: (id: string, instruction?: string) => Promise<void>;
  colorizeAll: (globalInstruction?: string) => Promise<void>;
  toggleApproved: (id: string) => void;
  removeItem: (id: string) => void;
  confirmColorized: () => void;

  // Stage 1 → skip
  skipToPrompts: () => void;

  // Stage 2
  setAction: (id: string, action: string) => void;
  setPrompt: (id: string, prompt: string) => void;
  enrichPrompt: (id: string) => Promise<void>;
  togglePromptApproved: (id: string) => void;
  setEndImage: (id: string, base64: string, mimeType: string) => void;
  removeEndImage: (id: string) => void;
  addExternalImages: (files: File[]) => Promise<void>;
  removePromptItem: (id: string) => void;
  confirmPrompts: () => void;

  // Stage 3
  generateVideo: (id: string, promptOverride?: string) => Promise<void>;
  generateAllVideos: () => Promise<void>;
  resumePolling: () => Promise<void>;

  // Navigation
  goBack: () => void;

  reset: () => void;
}

const INITIAL: Pick<
  IllustrationsStore,
  "stage" | "colorized" | "prompts" | "videos"
> = {
  stage: "upload",
  colorized: [],
  prompts: [],
  videos: [],
};

const safeStorage = createJSONStorage(() => ({
  getItem: (name: string) => localStorage.getItem(name),
  setItem: (name: string, value: string) => {
    try {
      localStorage.setItem(name, value);
    } catch (e) {
      if (e instanceof DOMException && e.name === "QuotaExceededError") {
        console.warn("[Studio] localStorage quota exceeded — state not persisted");
        window.dispatchEvent(new CustomEvent("studio:storage-full"));
      }
    }
  },
  removeItem: (name: string) => localStorage.removeItem(name),
}));

export const useIllustrations = create<IllustrationsStore>()(
  persist(
    (set, get) => ({
      ...INITIAL,

      addSketches: async (files) => {
        const items: ColorizedItem[] = await Promise.all(
          files.map(async (file) => ({
            id: nanoid(),
            originalBase64: await fileToBase64(file),
            originalMimeType: file.type || "image/jpeg",
            colorizedBase64: null,
            mimeType: file.type || "image/jpeg",
            status: "idle" as const,
            approved: true,
            instruction: "",
            referenceBase64: null,
            referenceMimeType: "image/jpeg",
          }))
        );
        set((s) => ({ colorized: [...s.colorized, ...items] }));
      },

      setItemInstruction: (id, instruction) =>
        set((s) => ({
          colorized: s.colorized.map((c) => (c.id === id ? { ...c, instruction } : c)),
        })),

      setItemReference: (id, base64, mimeType) =>
        set((s) => ({
          colorized: s.colorized.map((c) =>
            c.id === id ? { ...c, referenceBase64: base64, referenceMimeType: mimeType } : c
          ),
        })),

      removeItemReference: (id) =>
        set((s) => ({
          colorized: s.colorized.map((c) =>
            c.id === id ? { ...c, referenceBase64: null } : c
          ),
        })),

      colorizeItem: async (id, instruction) => {
        const item = get().colorized.find((c) => c.id === id);
        if (!item) return;

        // Guard: originalBase64 is stripped from localStorage persistence.
        // If item was reloaded from a previous session, the image is not available.
        if (!item.originalBase64) {
          set((s) => ({
            colorized: s.colorized.map((c) =>
              c.id === id
                ? { ...c, status: "error", error: "Image not available — remove this item and re-upload the sketch." }
                : c
            ),
          }));
          return;
        }

        set((s) => ({
          colorized: s.colorized.map((c) =>
            c.id === id ? { ...c, status: "generating", error: undefined } : c
          ),
        }));

        try {
          const prompt = buildColorizePrompt(instruction);
          const { base64, mimeType } = await colorizeSketch(
            item.originalBase64,
            prompt,
            item.originalMimeType,
            item.referenceBase64 ?? undefined,
            item.referenceMimeType
          );
          set((s) => ({
            colorized: s.colorized.map((c) =>
              c.id === id
                ? { ...c, colorizedBase64: base64, mimeType, status: "done" }
                : c
            ),
          }));
        } catch (e) {
          set((s) => ({
            colorized: s.colorized.map((c) =>
              c.id === id
                ? { ...c, status: "error", error: (e as Error).message }
                : c
            ),
          }));
        }
      },

      colorizeAll: async (globalInstruction) => {
        const { colorized, colorizeItem } = get();
        await pLimit(
          3,
          colorized
            .filter((c) => c.status !== "done")
            .map((c) => () => colorizeItem(c.id, c.instruction || globalInstruction))
        );
      },

      toggleApproved: (id) =>
        set((s) => ({
          colorized: s.colorized.map((c) =>
            c.id === id ? { ...c, approved: !c.approved } : c
          ),
        })),

      removeItem: (id) =>
        set((s) => ({ colorized: s.colorized.filter((c) => c.id !== id) })),

      skipToPrompts: () => set({ stage: "prompts" }),

      confirmColorized: () => {
        const { colorized } = get();
        const approved = colorized.filter(
          (c) => c.approved && c.status === "done" && c.colorizedBase64
        );
        const prompts: PromptItem[] = approved.map((c) => ({
          id: nanoid(),
          colorizedId: c.id,
          source: "colorized" as const,
          imageBase64: c.colorizedBase64!,
          mimeType: c.mimeType,
          action: "",
          prompt: "",
          promptStatus: "idle" as const,
          approved: true,
          endImageBase64: null,
          endImageMimeType: "image/jpeg",
        }));
        set({ prompts, stage: "prompts" });
      },

      setAction: (id, action) =>
        set((s) => ({
          prompts: s.prompts.map((p) => (p.id === id ? { ...p, action } : p)),
        })),

      setPrompt: (id, prompt) =>
        set((s) => ({
          prompts: s.prompts.map((p) => (p.id === id ? { ...p, prompt } : p)),
        })),

      enrichPrompt: async (id) => {
        const item = get().prompts.find((p) => p.id === id);
        if (!item) return;

        set((s) => ({
          prompts: s.prompts.map((p) =>
            p.id === id ? { ...p, promptStatus: "generating" } : p
          ),
        }));

        try {
          const hasEnd = !!item.endImageBase64;
          const visionPrompt = hasEnd
            ? `Write an animation prompt (25-35 words) for a video model. The first image is the start frame, the second is the end frame. Describe the motion transition between them${item.action.trim() ? `, focusing on: ${item.action.trim()}` : ""}. Include what moves, how it moves (direction, speed, smoothness), and how the scene transitions from start to end. Do NOT describe the scene, characters, or colors. Respond with ONLY the prompt text.`
            : item.action.trim()
            ? `Write an animation prompt (25-35 words) for a video model that already has this image as reference. Describe the motion for: ${item.action.trim()}. Include what moves, how it moves (direction, speed, smoothness), and the feel of the movement. Do NOT describe the scene, characters, colors, or visual style — the model sees the image. Respond with ONLY the prompt text.`
            : `Write an animation prompt (25-35 words) for a video model that already has this image as reference. Describe what moves, how it moves (direction, speed, smoothness), and the feel of the movement. Do NOT describe the scene, characters, colors, or visual style — the model sees the image. Respond with ONLY the prompt text.`;

          const images = [item.imageBase64];
          if (item.endImageBase64) images.push(item.endImageBase64);

          const text = await analyzeWithVision(visionPrompt, images);
          set((s) => ({
            prompts: s.prompts.map((p) =>
              p.id === id ? { ...p, prompt: text.trim(), promptStatus: "done" } : p
            ),
          }));
        } catch (e) {
          set((s) => ({
            prompts: s.prompts.map((p) =>
              p.id === id ? { ...p, promptStatus: "idle" } : p
            ),
          }));
          throw e;
        }
      },

      togglePromptApproved: (id) =>
        set((s) => ({
          prompts: s.prompts.map((p) =>
            p.id === id ? { ...p, approved: !p.approved } : p
          ),
        })),

      setEndImage: (id, base64, mimeType) =>
        set((s) => ({
          prompts: s.prompts.map((p) =>
            p.id === id ? { ...p, endImageBase64: base64, endImageMimeType: mimeType } : p
          ),
        })),

      removeEndImage: (id) =>
        set((s) => ({
          prompts: s.prompts.map((p) =>
            p.id === id ? { ...p, endImageBase64: null } : p
          ),
        })),

      addExternalImages: async (files) => {
        const items: PromptItem[] = await Promise.all(
          files.map(async (file) => ({
            id: nanoid(),
            colorizedId: null,
            source: "external" as const,
            imageBase64: await fileToBase64(file),
            mimeType: file.type || "image/jpeg",
            action: "",
            prompt: "",
            promptStatus: "idle" as const,
            approved: true,
            endImageBase64: null,
            endImageMimeType: "image/jpeg",
          }))
        );
        set((s) => ({ prompts: [...s.prompts, ...items] }));
      },

      removePromptItem: (id) =>
        set((s) => ({ prompts: s.prompts.filter((p) => p.id !== id) })),

      confirmPrompts: () => {
        const { prompts } = get();
        const approved = prompts.filter((p) => p.approved && p.prompt.trim());
        const videos: VideoItem[] = approved.map((p) => ({
          id: nanoid(),
          promptId: p.id,
          imageBase64: p.imageBase64,
          mimeType: p.mimeType,
          prompt: p.prompt,
          endImageBase64: p.endImageBase64,
          endImageMimeType: p.endImageMimeType,
          videoUrl: null,
          status: "idle",
        }));
        set({ videos, stage: "videos" });
      },

      generateVideo: async (id, promptOverride) => {
        const item = get().videos.find((v) => v.id === id);
        if (!item) return;

        if (promptOverride !== undefined) {
          set((s) => ({
            videos: s.videos.map((v) =>
              v.id === id ? { ...v, prompt: promptOverride } : v
            ),
          }));
        }

        set((s) => ({
          videos: s.videos.map((v) =>
            v.id === id ? { ...v, status: "generating", error: undefined } : v
          ),
        }));

        const effectivePrompt = promptOverride ?? item.prompt;
        // Guard: imageBase64 is stripped from localStorage persistence.
        if (!item.imageBase64) {
          set((s) => ({
            videos: s.videos.map((v) =>
              v.id === id
                ? { ...v, status: "error", error: "Image not available — go back to Prompts and regenerate." }
                : v
            ),
          }));
          return;
        }

        try {
          const startImage = base64ToDataUrl(item.imageBase64, item.mimeType);

          const input: Record<string, unknown> = {
            image: startImage,
            prompt: effectivePrompt,
            duration: 5,
            resolution: "720p",
            high_noise_loras: [{ path: HIGH_NOISE_LORA, scale: HIGH_NOISE_SCALE }],
            low_noise_loras: [{ path: LOW_NOISE_LORA, scale: LOW_NOISE_SCALE }],
            loras: [],
            last_image: item.endImageBase64
              ? base64ToDataUrl(item.endImageBase64, item.endImageMimeType)
              : "",
          };

          const started = await startWavespeedPrediction(WAN_MODEL, input);
          const predictionId = started.data?.id ?? started.id;

          set((s) => ({
            videos: s.videos.map((v) =>
              v.id === id ? { ...v, predictionId } : v
            ),
          }));

          const completed = await pollWavespeedPrediction(predictionId);
          const norm = completed.data ?? completed;

          if (norm.status !== "completed") {
            throw new Error(norm.error ?? `WaveSpeed prediction ${norm.status}`);
          }

          const videoUrl = norm.outputs?.[0];
          if (!videoUrl) throw new Error("WaveSpeed returned no output");

          set((s) => ({
            videos: s.videos.map((v) =>
              v.id === id ? { ...v, videoUrl, status: "done", predictionId: null } : v
            ),
          }));
        } catch (e) {
          set((s) => ({
            videos: s.videos.map((v) =>
              v.id === id
                ? { ...v, status: "error", error: (e as Error).message, predictionId: null }
                : v
            ),
          }));
        }
      },

      generateAllVideos: async () => {
        const { videos, generateVideo } = get();
        await pLimit(3, videos.filter((v) => v.status !== "done").map((v) => () => generateVideo(v.id)));
      },

      resumePolling: async () => {
        const stuck = get().videos.filter(
          (v) => v.status === "generating" && v.predictionId
        );
        if (!stuck.length) return;

        await Promise.all(
          stuck.map(async (vid) => {
            try {
              const completed = await pollWavespeedPrediction(vid.predictionId!);
              const norm = completed.data ?? completed;

              if (norm.status !== "completed") {
                throw new Error(norm.error ?? `WaveSpeed prediction ${norm.status}`);
              }

              const videoUrl = norm.outputs?.[0];
              if (!videoUrl) throw new Error("WaveSpeed returned no output");

              set((s) => ({
                videos: s.videos.map((v) =>
                  v.id === vid.id
                    ? { ...v, videoUrl, status: "done", predictionId: null }
                    : v
                ),
              }));
            } catch (e) {
              set((s) => ({
                videos: s.videos.map((v) =>
                  v.id === vid.id
                    ? { ...v, status: "error", error: (e as Error).message, predictionId: null }
                    : v
                ),
              }));
            }
          })
        );
      },

      goBack: () => {
        const { stage } = get();
        if (stage === "prompts") set({ stage: "upload" });
        else if (stage === "videos") set({ stage: "prompts" });
      },

      reset: () => set(INITIAL),
    }),
    {
      name: "studio-illustrations",
      storage: safeStorage,
      partialize: (s) => ({
        stage: s.stage,
        // Strip all base64 fields before persisting to localStorage.
        // Base64 images (100–500 KB each) overflow the 5–10 MB quota after 3–5 sketches.
        // Metadata (id, mimeType, instruction, prompt, approved, videoUrl) is preserved.
        // On reload: items appear as idle; users re-upload or regenerate as needed.
        colorized: s.colorized.map((c) => ({
          ...c,
          originalBase64: "",
          colorizedBase64: null,
          referenceBase64: null,
          status: "idle" as const,
          approved: false,
        })),
        prompts: s.prompts.map((p) => ({
          ...p,
          imageBase64: "",
          endImageBase64: null,
          promptStatus: "idle" as const,
          approved: false,
        })),
        videos: s.videos.map((v) => ({
          ...v,
          imageBase64: "",
          endImageBase64: null,
          status: (v.status === "done" ? "idle" : v.status) as VideoItem["status"],
          error: undefined,
        })),
      }),
    }
  )
);
