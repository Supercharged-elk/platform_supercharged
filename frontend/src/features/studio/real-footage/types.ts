export type RealFootageStage = "upload" | "actions" | "keyframes" | "videos";

/** A video uploaded to Gemini File API (valid for 48 h) */
export interface VideoSource {
  fileUri: string;
  mimeType: string;
  name: string;       // e.g. "files/abc123"
  displayName: string; // original filename
}

export interface DetectedAction {
  id: string;
  raw: string;      // as detected by Gemini
  enriched: string; // AI-enriched description (editable)
  approved: boolean;
}

export interface KeyframeItem {
  id: string;
  actionId: string;
  prompt: string;        // editable prompt used for image gen
  base64: string | null; // generated keyframe (base64 JPEG)
  mimeType: string;
  status: "idle" | "generating" | "done" | "error";
  error?: string;
  approved: boolean;
}

export interface VideoItem {
  id: string;
  keyframeId: string;
  base64: string;       // keyframe used as start_image
  prompt: string;
  videoUrl: string | null;
  status: "idle" | "generating" | "done" | "error";
  error?: string;
}

export interface RealFootageState {
  stage: RealFootageStage;
  // Stage 1 — persisted file refs (Gemini keeps them 48 h)
  videoSources: VideoSource[];
  creativeAnalysis: string;
  // Stage 2
  actions: DetectedAction[];
  // Stage 3
  keyframes: KeyframeItem[];
  // Stage 4
  videos: VideoItem[];
}
