"use client";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type {
  RealFootageStage,
  VideoSource,
  DetectedAction,
  KeyframeItem,
  VideoItem,
} from "../types";
import { nanoid, pLimit } from "../../_shared/utils";
import { analyzeVideos, generateImage } from "../../_shared/services/gemini";
import { chatWithOpenAI } from "../../_shared/services/openai";
import { waitForPrediction } from "../../_shared/services/replicate";
import { base64ToDataUrl } from "../../_shared/utils";

const KLING_MODEL = "kwaivgi/kling-v2-master";

const ANALYSIS_PROMPT = `You are a creative director analyzing footage for an AI production pipeline.

Given the uploaded video(s), please:
1. Describe the overall creative tone and visual style (2-3 sentences)
2. List 4-6 key actions or moments you observe (one per line, starting with "ACTION: ")
3. Suggest a brief visual treatment (1-2 sentences)

Be specific about visual elements, camera movements, lighting, and mood.`;

interface RealFootageStore {
  stage: RealFootageStage;
  videoSources: VideoSource[];
  creativeAnalysis: string;
  actions: DetectedAction[];
  keyframes: KeyframeItem[];
  videos: VideoItem[];

  // Stage 1
  analyzeVideo: (sources: VideoSource[]) => Promise<void>;
  confirmAnalysis: () => void;

  // Stage 2
  setActionEnriched: (id: string, enriched: string) => void;
  toggleActionApproved: (id: string) => void;
  enrichActions: () => Promise<void>;
  confirmActions: () => void;

  // Stage 3
  setKeyframePrompt: (id: string, prompt: string) => void;
  generateKeyframe: (id: string) => Promise<void>;
  generateAllKeyframes: () => Promise<void>;
  toggleKeyframeApproved: (id: string) => void;
  confirmKeyframes: () => void;

  // Stage 4
  generateVideo: (id: string, promptOverride?: string) => Promise<void>;
  generateAllVideos: () => Promise<void>;

  // Navigation
  goBack: () => void;

  reset: () => void;
}

const INITIAL: Omit<RealFootageStore, keyof Omit<RealFootageStore, "stage" | "videoSources" | "creativeAnalysis" | "actions" | "keyframes" | "videos">> = {
  stage: "upload",
  videoSources: [],
  creativeAnalysis: "",
  actions: [],
  keyframes: [],
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

export const useRealFootage = create<RealFootageStore>()(
  persist(
    (set, get) => ({
      stage: "upload",
      videoSources: [],
      creativeAnalysis: "",
      actions: [],
      keyframes: [],
      videos: [],

      analyzeVideo: async (sources) => {
        const text = await analyzeVideos(sources, ANALYSIS_PROMPT);

        const lines = text.split("\n");
        const rawActions: string[] = [];
        for (const line of lines) {
          const match = line.match(/^ACTION:\s*(.+)/i);
          if (match) rawActions.push(match[1].trim());
        }

        const actions: DetectedAction[] = rawActions.map((raw) => ({
          id: nanoid(),
          raw,
          enriched: raw,
          approved: true,
        }));

        const uploadedAt = Date.now();
        const sourcesWithTimestamp = sources.map((s) => ({ ...s, uploadedAt }));
        set({ videoSources: sourcesWithTimestamp, creativeAnalysis: text, actions });
      },

      confirmAnalysis: () => set({ stage: "actions" }),

      setActionEnriched: (id, enriched) =>
        set((s) => ({
          actions: s.actions.map((a) => (a.id === id ? { ...a, enriched } : a)),
        })),

      toggleActionApproved: (id) =>
        set((s) => ({
          actions: s.actions.map((a) =>
            a.id === id ? { ...a, approved: !a.approved } : a
          ),
        })),

      enrichActions: async () => {
        const { actions, creativeAnalysis } = get();

        const schema = {
          type: "object",
          properties: {
            items: {
              type: "array",
              items: { type: "string" },
            },
          },
          required: ["items"],
          additionalProperties: false,
        };

        const userPrompt = `You are a creative director. Based on this video analysis:

${creativeAnalysis}

Enrich each action with cinematic detail (camera angle, lighting, color palette, mood, props). Max 60 words each.

Actions:
${actions.map((a, i) => `${i + 1}. ${a.raw}`).join("\n")}

Respond with ONLY a JSON object in the format { "items": ["...", "..."] }, one string per action, in the same order.`;

        const result = await chatWithOpenAI(
          [
            {
              role: "system",
              content:
                "You are a prompt engineer expert in cinematic photography direction and AI image generation. Your role is to enrich action descriptions with precise cinematographic detail.",
            },
            {
              role: "user",
              content: userPrompt,
            },
          ],
          { model: "gpt-4o", schema }
        );

        try {
          // Handle both structured { items: [...] } and legacy bare JSON array string
          let enriched: string[];
          if (result && typeof result === "object" && Array.isArray((result as { items: string[] }).items)) {
            enriched = (result as { items: string[] }).items;
          } else {
            const text = typeof result === "string" ? result : JSON.stringify(result);
            const jsonMatch = text.match(/\[[\s\S]*\]/);
            if (!jsonMatch) throw new Error("No array found in response");
            enriched = JSON.parse(jsonMatch[0]);
          }
          set((s) => ({
            actions: s.actions.map((a, i) => ({
              ...a,
              enriched: enriched[i] || a.enriched,
            })),
          }));
        } catch {
          // Keep originals on parse failure
        }
      },

      confirmActions: () => {
        const approved = get().actions.filter((a) => a.approved);
        const keyframes: KeyframeItem[] = approved.map((a) => ({
          id: nanoid(),
          actionId: a.id,
          prompt: a.enriched,
          base64: null,
          mimeType: "image/jpeg",
          status: "idle",
          approved: false,
        }));
        set({ keyframes, stage: "keyframes" });
      },

      setKeyframePrompt: (id, prompt) =>
        set((s) => ({
          keyframes: s.keyframes.map((k) => (k.id === id ? { ...k, prompt } : k)),
        })),

      generateKeyframe: async (id) => {
        const item = get().keyframes.find((k) => k.id === id);
        if (!item) return;

        set((s) => ({
          keyframes: s.keyframes.map((k) =>
            k.id === id ? { ...k, status: "generating", error: undefined } : k
          ),
        }));

        try {
          const { base64, mimeType } = await generateImage(
            `Cinematic keyframe for: ${item.prompt}. High quality, photorealistic, professional cinematography.`
          );
          set((s) => ({
            keyframes: s.keyframes.map((k) =>
              k.id === id ? { ...k, base64, mimeType, status: "done" } : k
            ),
          }));
        } catch (e) {
          set((s) => ({
            keyframes: s.keyframes.map((k) =>
              k.id === id ? { ...k, status: "error", error: (e as Error).message } : k
            ),
          }));
        }
      },

      generateAllKeyframes: async () => {
        const { keyframes, generateKeyframe } = get();
        await pLimit(3, keyframes.filter((k) => k.status !== "done").map((k) => () => generateKeyframe(k.id)));
      },

      toggleKeyframeApproved: (id) =>
        set((s) => ({
          keyframes: s.keyframes.map((k) =>
            k.id === id ? { ...k, approved: !k.approved } : k
          ),
        })),

      confirmKeyframes: () => {
        const done = get().keyframes.filter((k) => k.status === "done" && k.approved && k.base64);
        const videos: VideoItem[] = done.map((k) => ({
          id: nanoid(),
          keyframeId: k.id,
          base64: k.base64!,
          prompt: k.prompt,
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
          const startImage = base64ToDataUrl(item.base64, "image/jpeg");
          const videoUrl = await waitForPrediction(KLING_MODEL, {
            start_image: startImage,
            prompt: effectivePrompt,
            duration: 5,
            aspect_ratio: "16:9",
          });
          set((s) => ({
            videos: s.videos.map((v) =>
              v.id === id ? { ...v, videoUrl, status: "done" } : v
            ),
          }));
        } catch (e) {
          set((s) => ({
            videos: s.videos.map((v) =>
              v.id === id ? { ...v, status: "error", error: (e as Error).message } : v
            ),
          }));
        }
      },

      generateAllVideos: async () => {
        const { videos, generateVideo } = get();
        await pLimit(3, videos.filter((v) => v.status !== "done").map((v) => () => generateVideo(v.id)));
      },

      goBack: () => {
        const { stage } = get();
        if (stage === "actions") set({ stage: "upload" });
        else if (stage === "keyframes") set({ stage: "actions" });
        else if (stage === "videos") set({ stage: "keyframes" });
      },

      reset: () =>
        set({
          stage: "upload",
          videoSources: [],
          creativeAnalysis: "",
          actions: [],
          keyframes: [],
          videos: [],
        }),
    }),
    {
      name: "studio-real-footage",
      storage: safeStorage,
      partialize: (s) => ({
        stage: s.stage,
        videoSources: s.videoSources,
        creativeAnalysis: s.creativeAnalysis,
        actions: s.actions,
        keyframes: s.keyframes,
        videos: s.videos,
      }),
    }
  )
);
