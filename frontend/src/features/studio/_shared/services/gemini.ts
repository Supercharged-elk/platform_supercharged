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

const DEFAULT_DIRECT_UPLOAD_THRESHOLD_MB = 8;
const SUPPORTED_VIDEO_MIME_TYPES = new Set([
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "video/x-matroska",
]);

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

  return { ok: true };
}

function getDirectUploadThresholdBytes() {
  const envVal = Number(process.env.NEXT_PUBLIC_RF_DIRECT_UPLOAD_THRESHOLD_MB);
  const thresholdMb =
    Number.isFinite(envVal) && envVal > 0 ? envVal : DEFAULT_DIRECT_UPLOAD_THRESHOLD_MB;
  return Math.floor(thresholdMb * 1024 * 1024);
}

function withCodeError(
  message: string,
  code?: GeminiUploadErrorCode,
  retryable?: boolean
) {
  const err = new Error(message) as Error & {
    code?: GeminiUploadErrorCode;
    retryable?: boolean;
  };
  err.code = code;
  err.retryable = retryable;
  return err;
}

type GeminiUploadStartResponse = {
  uploadUrl: string;
  mimeType: string;
  displayName: string;
};

type GeminiUploadFinalizeResponse = GeminiFileRef;

type GeminiUploadFinalizePayload = {
  file: {
    name: string;
    uri?: string;
    mimeType?: string;
    displayName?: string;
    state?: string;
  };
};

async function parseUploadError(res: Response): Promise<GeminiUploadErrorPayload> {
  return (await res
    .json()
    .catch(() => ({ error: res.statusText, code: res.status === 413 ? "FILE_TOO_LARGE" : undefined }))) as GeminiUploadErrorPayload;
}

async function uploadViaDirectResumable(
  file: File,
  onProgress?: (pct: number) => void
): Promise<GeminiFileRef> {
  const mimeType = file.type || "video/mp4";
  const displayName = file.name || "upload";

  onProgress?.(15);

  const startRes = await fetch(UPLOAD_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "start",
      mimeType,
      displayName,
      fileSize: file.size,
    }),
  });
  if (!startRes.ok) {
    const err = await parseUploadError(startRes);
    throw withCodeError(err.message ?? err.error ?? "Gemini upload start failed", err.code, err.retryable);
  }

  const startData = (await startRes.json()) as GeminiUploadStartResponse;
  onProgress?.(50);

  const uploadRes = await fetch(startData.uploadUrl, {
    method: "POST",
    headers: {
      "Content-Type": startData.mimeType || mimeType,
      "X-Goog-Upload-Offset": "0",
      "X-Goog-Upload-Command": "upload, finalize",
    },
    body: file,
  });
  if (!uploadRes.ok) {
    const errText = await uploadRes.text();
    throw withCodeError(
      `Gemini direct upload failed: ${errText || uploadRes.statusText}`,
      "UPSTREAM_ERROR",
      uploadRes.status >= 500
    );
  }

  const uploadData = (await uploadRes.json()) as GeminiUploadFinalizePayload;
  const fileName = uploadData?.file?.name;
  if (!fileName) {
    throw withCodeError("Gemini direct upload missing file name", "UPSTREAM_ERROR", true);
  }
  onProgress?.(80);

  const finalizeRes = await fetch(UPLOAD_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "finalize",
      fileName,
      mimeType: uploadData.file.mimeType || mimeType,
      displayName: uploadData.file.displayName || displayName,
      fileUri: uploadData.file.uri,
      state: uploadData.file.state,
    }),
  });
  if (!finalizeRes.ok) {
    const err = await parseUploadError(finalizeRes);
    throw withCodeError(err.message ?? err.error ?? "Gemini upload finalize failed", err.code, err.retryable);
  }

  onProgress?.(100);
  return (await finalizeRes.json()) as GeminiUploadFinalizeResponse;
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
    throw withCodeError(preflight.error.message, preflight.error.code, preflight.error.retryable);
  }

  // For large files, avoid proxying the binary through the app server (Vercel body limits).
  if (file.size >= getDirectUploadThresholdBytes()) {
    return uploadViaDirectResumable(file, onProgress);
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
    const err = await parseUploadError(res);
    const message = err.message ?? err.error ?? "Gemini upload failed";
    throw withCodeError(message, err.code, err.retryable);
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
