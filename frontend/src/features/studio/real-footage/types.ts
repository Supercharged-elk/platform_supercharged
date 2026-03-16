export type RealFootageStage = "upload" | "actions" | "keyframes" | "videos";

/** A video uploaded to Gemini File API (valid for 48 h) */
export interface VideoSource {
  fileUri: string;
  mimeType: string;
  name: string;       // e.g. "files/abc123"
  displayName: string; // original filename
  uploadedAt?: number; // Unix ms timestamp when file was uploaded
}

export interface DetectedAction {
  id: string;
  raw: string;          // as entered by the designer
  imagePrompt: string;  // enriched prompt for Gemini image generation (Stage 3)
  videoPrompt: string;  // enriched prompt for Kling animation (Stage 4)
  approved: boolean;
}

export interface KeyframeItem {
  id: string;
  actionId: string;
  imagePrompt: string;  // editable prompt used for image gen
  videoPrompt: string;  // carried from action, used for animation in Stage 4
  base64: string | null;
  mimeType: string;
  status: "idle" | "generating" | "done" | "error";
  error?: string;
  approved: boolean;
}

export interface VideoItem {
  id: string;
  keyframeId: string;
  base64: string;         // keyframe used as start_image
  imagePrompt: string;    // for reference display
  videoPrompt: string;    // prompt used for Kling animation (editable locally)
  videoUrl: string | null;
  status: "idle" | "generating" | "done" | "error";
  error?: string;
}

export interface RealFootageState {
  stage: RealFootageStage;
  // Stage 1 — persisted file refs (Gemini keeps them 48 h)
  videoSources: VideoSource[];
  creativeAnalysis: string; // art direction description from Gemini
  // Stage 2
  actionsText: string;    // raw text entered by the designer (one action per line)
  actions: DetectedAction[];
  // Stage 3
  keyframes: KeyframeItem[];
  // Stage 4
  videos: VideoItem[];
}
