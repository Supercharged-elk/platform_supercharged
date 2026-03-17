export type IllustrationsStage = "upload" | "prompts" | "videos";

export interface ColorizedItem {
  id: string;
  originalBase64: string;         // uploaded B&W sketch
  originalMimeType: string;       // mime type of the original
  colorizedBase64: string | null; // Gemini colorized output
  mimeType: string;               // mime type of the colorized result
  status: "idle" | "generating" | "done" | "error";
  error?: string;
  approved: boolean;
  instruction: string;            // per-item instruction (overrides global when non-empty)
  referenceBase64: string | null; // optional color reference image
  referenceMimeType: string;      // mime type of the reference
}

export interface PromptItem {
  id: string;
  colorizedId: string | null;       // null for externally-added images
  source: "colorized" | "external";
  imageBase64: string;
  mimeType: string;
  action: string;                   // short description: "bird flies through clouds"
  prompt: string;                   // full animation prompt (generated or manual)
  promptStatus: "idle" | "generating" | "done";
  approved: boolean;
  endImageBase64: string | null;    // optional end frame for the video
  endImageMimeType: string;
}

export interface VideoItem {
  id: string;
  promptId: string;
  imageBase64: string;
  mimeType: string;
  prompt: string;
  endImageBase64: string | null;    // passed to WaveSpeed as end_image
  endImageMimeType: string;
  videoUrl: string | null;
  status: "idle" | "generating" | "done" | "error";
  error?: string;
}

export interface IllustrationsState {
  stage: IllustrationsStage;
  // Stage 1
  colorized: ColorizedItem[];
  // Stage 2
  prompts: PromptItem[];
  // Stage 3
  videos: VideoItem[];
}
