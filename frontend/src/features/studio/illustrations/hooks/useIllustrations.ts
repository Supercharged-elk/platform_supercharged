"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { IllustrationsStage, ColorizedItem, PromptItem, VideoItem } from "../types";
import { nanoid, fileToBase64, base64ToDataUrl } from "../../_shared/utils";
import { colorizeSketch, analyzeWithVision } from "../../_shared/services/gemini";
import { waitForWavespeedPrediction } from "../../_shared/services/wavespeed";

const WAN_MODEL = "wavespeed-ai/wan-2.2/image-to-video-lora";

const HIGH_NOISE_LORA = "https://d2p7pge43lyniu.cloudfront.net/output/589c67a8-8007-439d-9a74-6050aa947dac-u1_i2v_A14B_separate_high_noise_lora_b99f07d8-e78d-4b2f-b077-ddcb52c2cb07.safetensors";
const LOW_NOISE_LORA  = "https://d2p7pge43lyniu.cloudfront.net/output/589c67a8-8007-439d-9a74-6050aa947dac-u1_i2v_A14B_separate_low_noise_lora_0bef2543-44ab-41a5-9f67-6fb7a97a7622.safetensors";
const HIGH_NOISE_SCALE = 1.2;
const LOW_NOISE_SCALE  = 0.3;

const DEFAULT_COLORIZE_PROMPT =
  "Colorize this black and white sketch with vibrant, realistic colors. Keep the original lines and composition intact.";

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
  colorizeItem: (id: string, instruction?: string) => Promise<void>;
  colorizeAll: (instruction?: string) => Promise<void>;
  toggleApproved: (id: string) => void;
  removeItem: (id: string) => void;
  confirmColorized: () => void;

  // Stage 2
  setPrompt: (id: string, prompt: string) => void;
  regeneratePrompt: (id: string) => Promise<void>;
  confirmPrompts: () => void;

  // Stage 3
  generateVideo: (id: string, promptOverride?: string) => Promise<void>;
  generateAllVideos: () => Promise<void>;

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

export const useIllustrations = create<IllustrationsStore>()(
  persist(
    (set, get) => ({
      ...INITIAL,

      addSketches: async (files) => {
        const items: ColorizedItem[] = await Promise.all(
          files.map(async (file) => ({
            id: nanoid(),
            originalBase64: await fileToBase64(file),
            colorizedBase64: null,
            mimeType: "image/jpeg",
            status: "idle" as const,
            approved: true,
          }))
        );
        set((s) => ({ colorized: [...s.colorized, ...items] }));
      },

      colorizeItem: async (id, instruction) => {
        const item = get().colorized.find((c) => c.id === id);
        if (!item) return;

        set((s) => ({
          colorized: s.colorized.map((c) =>
            c.id === id ? { ...c, status: "generating", error: undefined } : c
          ),
        }));

        try {
          const prompt = buildColorizePrompt(instruction);
          const { base64, mimeType } = await colorizeSketch(item.originalBase64, prompt);
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

      colorizeAll: async (instruction) => {
        const { colorized, colorizeItem } = get();
        await Promise.all(
          colorized.filter((c) => c.status !== "done").map((c) => colorizeItem(c.id, instruction))
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

      confirmColorized: () => {
        const { colorized } = get();
        const approved = colorized.filter(
          (c) => c.approved && c.status === "done" && c.colorizedBase64
        );
        const prompts: PromptItem[] = approved.map((c) => ({
          id: nanoid(),
          colorizedId: c.id,
          imageBase64: c.colorizedBase64!,
          mimeType: c.mimeType,
          prompt: "A smooth animation of this illustration coming to life with gentle movement",
          approved: true,
        }));
        set({ prompts, stage: "prompts" });
      },

      setPrompt: (id, prompt) =>
        set((s) => ({
          prompts: s.prompts.map((p) => (p.id === id ? { ...p, prompt } : p)),
        })),

      regeneratePrompt: async (id) => {
        const item = get().prompts.find((p) => p.id === id);
        if (!item) return;

        try {
          const text = await analyzeWithVision(
            `You are a creative director. Generate a vivid, cinematic video animation prompt (max 40 words) for this colorized illustration.
The prompt should describe smooth, elegant movement that brings the illustration to life.
Respond with ONLY the prompt text, no explanation.`,
            [item.imageBase64]
          );
          set((s) => ({
            prompts: s.prompts.map((p) =>
              p.id === id ? { ...p, prompt: text.trim() } : p
            ),
          }));
        } catch {
          // Keep existing prompt on error
        }
      },

      confirmPrompts: () => {
        const { prompts } = get();
        const approved = prompts.filter((p) => p.approved);
        const videos: VideoItem[] = approved.map((p) => ({
          id: nanoid(),
          promptId: p.id,
          imageBase64: p.imageBase64,
          mimeType: p.mimeType,
          prompt: p.prompt,
          videoUrl: null,
          status: "idle",
        }));
        set({ videos, stage: "videos" });
      },

      generateVideo: async (id, promptOverride) => {
        const item = get().videos.find((v) => v.id === id);
        if (!item) return;

        // Persist prompt override to store before generating
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

        try {
          const startImage = base64ToDataUrl(item.imageBase64, item.mimeType);

          const input: Record<string, unknown> = {
            image: startImage,
            prompt: effectivePrompt,
            high_noise_lora: HIGH_NOISE_LORA,
            high_noise_lora_scale: HIGH_NOISE_SCALE,
            low_noise_lora: LOW_NOISE_LORA,
            low_noise_lora_scale: LOW_NOISE_SCALE,
            num_frames: 81,
            fps: 16,
          };

          const videoUrl = await waitForWavespeedPrediction(WAN_MODEL, input);
          set((s) => ({
            videos: s.videos.map((v) =>
              v.id === id ? { ...v, videoUrl, status: "done" } : v
            ),
          }));
        } catch (e) {
          set((s) => ({
            videos: s.videos.map((v) =>
              v.id === id
                ? { ...v, status: "error", error: (e as Error).message }
                : v
            ),
          }));
        }
      },

      generateAllVideos: async () => {
        const { videos, generateVideo } = get();
        await Promise.all(
          videos.filter((v) => v.status !== "done").map((v) => generateVideo(v.id))
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
      partialize: (s) => ({
        stage: s.stage,
        colorized: s.colorized,
        prompts: s.prompts,
        videos: s.videos,
      }),
    }
  )
);
