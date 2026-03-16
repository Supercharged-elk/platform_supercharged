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

const KLING_MODEL = "kwaivgi/kling-v2.1";

/**
 * Stage 1: ask Gemini for a creative/art direction description based on
 * reference footage. No action extraction — that comes from the designer
 * in Stage 2.
 */
const ART_DIRECTION_PROMPT = `You are a creative director analyzing reference footage for an AI video production pipeline.

Based on the uploaded video(s), produce a detailed art direction brief that describes:
1. Overall visual style and aesthetic (2-3 sentences)
2. Color palette and lighting treatment (1-2 sentences)
3. Camera style and movement language (1-2 sentences)
4. Mood, tone, and pacing (1-2 sentences)
5. Any distinctive visual elements, textures, or motifs worth replicating

Be specific and evocative. This brief will guide image and video generation in subsequent steps.`;

interface RealFootageStore {
  stage: RealFootageStage;
  videoSources: VideoSource[];
  creativeAnalysis: string;
  actionsText: string;
  actions: DetectedAction[];
  keyframes: KeyframeItem[];
  videos: VideoItem[];

  // Stage 1
  analyzeVideo: (sources: VideoSource[]) => Promise<void>;
  confirmAnalysis: () => void;

  // Stage 2
  setActionsText: (text: string) => void;
  setActionImagePrompt: (id: string, imagePrompt: string) => void;
  setActionVideoPrompt: (id: string, videoPrompt: string) => void;
  toggleActionApproved: (id: string) => void;
  enrichActions: () => Promise<void>;
  confirmActions: () => void;

  // Stage 3
  setKeyframeImagePrompt: (id: string, prompt: string) => void;
  generateKeyframe: (id: string) => Promise<void>;
  generateAllKeyframes: () => Promise<void>;
  toggleKeyframeApproved: (id: string) => void;
  confirmKeyframes: () => void;

  // Stage 4
  generateVideo: (id: string, videoPromptOverride?: string) => Promise<void>;
  generateAllVideos: () => Promise<void>;

  // Navigation
  goBack: () => void;

  reset: () => void;
}

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
      actionsText: "",
      actions: [],
      keyframes: [],
      videos: [],

      // ── Stage 1 ──────────────────────────────────────────────────────────
      analyzeVideo: async (sources) => {
        // Gemini analyzes reference footage → returns art direction text only.
        // Actions are NOT extracted here — the designer enters them in Stage 2.
        const text = await analyzeVideos(sources, ART_DIRECTION_PROMPT);
        const uploadedAt = Date.now();
        const sourcesWithTimestamp = sources.map((s) => ({ ...s, uploadedAt }));
        set({ videoSources: sourcesWithTimestamp, creativeAnalysis: text });
      },

      confirmAnalysis: () => set({ stage: "actions" }),

      // ── Stage 2 ──────────────────────────────────────────────────────────
      setActionsText: (text) => set({ actionsText: text }),

      setActionImagePrompt: (id, imagePrompt) =>
        set((s) => ({
          actions: s.actions.map((a) => (a.id === id ? { ...a, imagePrompt } : a)),
        })),

      setActionVideoPrompt: (id, videoPrompt) =>
        set((s) => ({
          actions: s.actions.map((a) => (a.id === id ? { ...a, videoPrompt } : a)),
        })),

      toggleActionApproved: (id) =>
        set((s) => ({
          actions: s.actions.map((a) =>
            a.id === id ? { ...a, approved: !a.approved } : a
          ),
        })),

      enrichActions: async () => {
        const { actionsText, creativeAnalysis } = get();

        // Parse actions: split by newlines, strip leading numbering/bullets, drop blanks
        const rawLines = actionsText
          .split("\n")
          .map((l) => l.replace(/^[\d\.\-\*\•]+\s*/, "").trim())
          .filter(Boolean);

        if (!rawLines.length) return;

        const schema = {
          type: "object",
          properties: {
            items: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  imagePrompt: { type: "string" },
                  videoPrompt: { type: "string" },
                },
                required: ["imagePrompt", "videoPrompt"],
                additionalProperties: false,
              },
            },
          },
          required: ["items"],
          additionalProperties: false,
        };

        const userPrompt = `Art direction brief:
${creativeAnalysis}

Actions to enrich (${rawLines.length} total):
${rawLines.map((l, i) => `${i + 1}. ${l}`).join("\n")}

For each action produce:
- imagePrompt: a detailed prompt for an AI image generator (Gemini). Describe composition, lighting, color palette, mood, camera angle, visual style — in line with the art direction. Max 80 words.
- videoPrompt: a detailed prompt for an AI video generator (Kling) that will animate the generated image. Describe motion, camera movement, timing, atmosphere. Max 60 words.

Return one item per action in the same order.`;

        const result = await chatWithOpenAI(
          [
            {
              role: "system",
              content:
                "You are a prompt engineer specialized in cinematic AI video production. You create precise, evocative prompts for image and video generation models.",
            },
            { role: "user", content: userPrompt },
          ],
          { model: "gpt-4o", schema }
        );

        const items = (
          result as { items: { imagePrompt: string; videoPrompt: string }[] }
        ).items;

        const actions: DetectedAction[] = rawLines.map((raw, i) => ({
          id: nanoid(),
          raw,
          imagePrompt: items[i]?.imagePrompt ?? raw,
          videoPrompt: items[i]?.videoPrompt ?? raw,
          approved: true,
        }));

        set({ actions });
      },

      confirmActions: () => {
        const approved = get().actions.filter((a) => a.approved);
        const keyframes: KeyframeItem[] = approved.map((a) => ({
          id: nanoid(),
          actionId: a.id,
          imagePrompt: a.imagePrompt,
          videoPrompt: a.videoPrompt,
          base64: null,
          mimeType: "image/jpeg",
          status: "idle",
          approved: false,
        }));
        set({ keyframes, stage: "keyframes" });
      },

      // ── Stage 3 ──────────────────────────────────────────────────────────
      setKeyframeImagePrompt: (id, prompt) =>
        set((s) => ({
          keyframes: s.keyframes.map((k) =>
            k.id === id ? { ...k, imagePrompt: prompt } : k
          ),
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
          const { base64, mimeType } = await generateImage(item.imagePrompt);
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
        await pLimit(
          3,
          keyframes.filter((k) => k.status !== "done").map((k) => () => generateKeyframe(k.id))
        );
      },

      toggleKeyframeApproved: (id) =>
        set((s) => ({
          keyframes: s.keyframes.map((k) =>
            k.id === id ? { ...k, approved: !k.approved } : k
          ),
        })),

      confirmKeyframes: () => {
        const done = get().keyframes.filter(
          (k) => k.status === "done" && k.approved && k.base64
        );
        const videos: VideoItem[] = done.map((k) => ({
          id: nanoid(),
          keyframeId: k.id,
          base64: k.base64!,
          imagePrompt: k.imagePrompt,
          videoPrompt: k.videoPrompt,
          videoUrl: null,
          status: "idle",
        }));
        set({ videos, stage: "videos" });
      },

      // ── Stage 4 ──────────────────────────────────────────────────────────
      generateVideo: async (id, videoPromptOverride) => {
        const item = get().videos.find((v) => v.id === id);
        if (!item) return;

        if (videoPromptOverride !== undefined) {
          set((s) => ({
            videos: s.videos.map((v) =>
              v.id === id ? { ...v, videoPrompt: videoPromptOverride } : v
            ),
          }));
        }

        set((s) => ({
          videos: s.videos.map((v) =>
            v.id === id ? { ...v, status: "generating", error: undefined } : v
          ),
        }));

        const effectivePrompt = videoPromptOverride ?? item.videoPrompt;

        try {
          const startImage = base64ToDataUrl(item.base64, "image/jpeg");
          const videoUrl = await waitForPrediction(KLING_MODEL, {
            mode: "pro",
            start_image: startImage,
            prompt: effectivePrompt,
            duration: 5,
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
        await pLimit(
          3,
          videos.filter((v) => v.status !== "done").map((v) => () => generateVideo(v.id))
        );
      },

      // ── Navigation ───────────────────────────────────────────────────────
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
          actionsText: "",
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
        actionsText: s.actionsText,
        actions: s.actions,
        keyframes: s.keyframes,
        videos: s.videos,
      }),
    }
  )
);
