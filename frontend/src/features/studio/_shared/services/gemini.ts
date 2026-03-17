const ENDPOINT = "/api/studio/gemini";
const UPLOAD_ENDPOINT = "/api/studio/gemini-upload";

export type GeminiUploadErrorCode =
  | "MISSING_API_KEY"
  | "FILE_TOO_LARGE"
  | "UNSUPPORTED_MIME"
  | "UPLOAD_TIMEOUT"
  | "UPSTREAM_ERROR"
  | "INVALID_FORM";

export interface GeminiUploadErrorPayload {
  code?: GeminiUploadErrorCode;
  message?: string;
  retryable?: boolean;
  error?: string;
}

export interface GeminiFileRef {
  fileUri: string;
  mimeType: string;
  name: string;
  displayName: string;
}

// Gemini supports larger files; keep this high by default and let deploy env lower it if needed.
const DEFAULT_RF_MAX_UPLOAD_MB = 512;
const SUPPORTED_VIDEO_MIME_TYPES = new Set([
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "video/x-matroska",
]);

function getConfiguredMaxUploadBytes() {
  const envVal = Number(process.env.NEXT_PUBLIC_RF_MAX_UPLOAD_MB);
  const maxMb = Number.isFinite(envVal) && envVal > 0 ? envVal : DEFAULT_RF_MAX_UPLOAD_MB;
  return Math.floor(maxMb * 1024 * 1024);
}

export function validateGeminiUploadFile(
  file: File
): { ok: true } | { ok: false; error: { code: GeminiUploadErrorCode; message: string; retryable: boolean } } {
  if (!SUPPORTED_VIDEO_MIME_TYPES.has(file.type)) {
    return {
      ok: false,
      error: {
        code: "UNSUPPORTED_MIME",
        message: "Unsupported video format. Use MP4, MOV, or WebM.",
        retryable: false,
      },
    };
  }

  const maxBytes = getConfiguredMaxUploadBytes();
  if (file.size > maxBytes) {
    const maxMb = Math.round(maxBytes / (1024 * 1024));
    return {
      ok: false,
      error: {
        code: "FILE_TOO_LARGE",
        message: `File too large. Max allowed is ${maxMb} MB.`,
        retryable: false,
      },
    };
  }

  return { ok: true };
}

/**
 * Upload a video (or image) File to the Gemini File API.
 * The route handler proxies the upload and waits for state=ACTIVE.
 * Returns a file ref (fileUri) that can be passed to analyzeVideos().
 */
export async function uploadToGemini(
  file: File,
  onProgress?: (pct: number) => void
): Promise<GeminiFileRef> {
  const preflight = validateGeminiUploadFile(file);
  if (!preflight.ok) {
    const err = new Error(preflight.error.message) as Error & {
      code?: GeminiUploadErrorCode;
      retryable?: boolean;
    };
    err.code = preflight.error.code;
    err.retryable = preflight.error.retryable;
    throw err;
  }

  // Signal 10% immediately so the UI feels responsive
  onProgress?.(10);

  const form = new FormData();
  form.append("file", file);

  const res = await fetch(UPLOAD_ENDPOINT, {
    method: "POST",
    body: form,
  });

  onProgress?.(90);

  if (!res.ok) {
    const err = (await res.json().catch(() => ({ error: res.statusText }))) as GeminiUploadErrorPayload;
    const message = err.message ?? err.error ?? "Gemini upload failed";
    const wrapped = new Error(message) as Error & {
      code?: GeminiUploadErrorCode;
      retryable?: boolean;
    };
    wrapped.code = err.code;
    wrapped.retryable = err.retryable;
    throw wrapped;
  }

  onProgress?.(100);
  return res.json();
}

/**
 * Analyze one or more already-uploaded videos via Gemini 1.5 Flash.
 * fileRefs come from uploadToGemini().
 */
export async function analyzeVideos(
  fileRefs: GeminiFileRef[],
  prompt: string
): Promise<string> {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      mode: "video",
      fileUris: fileRefs.map((r) => ({ uri: r.fileUri, mimeType: r.mimeType })),
      prompt,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? "Gemini video analysis failed");
  }
  const data = await res.json();
  return data.text as string;
}

/** Analyze images (or just text) with Gemini Vision. Returns text. */
export async function analyzeWithVision(prompt: string, images: string[] = []): Promise<string> {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode: "vision", prompt, images }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? "Gemini vision failed");
  }
  const data = await res.json();
  return data.text as string;
}

/** Generate an image from a text prompt using Imagen 3. Returns base64 string. */
export async function generateImage(prompt: string): Promise<{ base64: string; mimeType: string }> {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode: "generate", prompt }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? "Gemini image generation failed");
  }
  return res.json();
}

/** Colorize a B&W sketch using Gemini image gen. Returns base64 + mimeType. */
export async function colorizeSketch(
  imageBase64: string,
  prompt?: string,
  mimeType?: string,
  referenceBase64?: string,
  referenceMimeType?: string
): Promise<{ base64: string; mimeType: string }> {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode: "colorize", imageBase64, prompt, mimeType, referenceBase64, referenceMimeType }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? "Gemini colorize failed");
  }
  return res.json();
}
