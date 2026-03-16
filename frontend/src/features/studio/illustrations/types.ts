export type IllustrationsStage = "upload" | "prompts" | "videos";

export interface ColorizedItem {
  id: string;
  originalBase64: string;   // uploaded B&W sketch
  colorizedBase64: string | null; // Gemini colorized output
  mimeType: string;
  status: "idle" | "generating" | "done" | "error";
  error?: string;
  approved: boolean;
}

export interface PromptItem {
  id: string;
  colorizedId: string;
  imageBase64: string;      // colorized image
  mimeType: string;
  prompt: string;           // user-editable video prompt
  approved: boolean;
}

export interface VideoItem {
  id: string;
  promptId: string;
  imageBase64: string;
  mimeType: string;
  prompt: string;
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
