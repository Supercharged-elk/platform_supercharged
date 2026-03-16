const ENDPOINT = "/api/studio/gemini";
const UPLOAD_ENDPOINT = "/api/studio/gemini-upload";

export interface GeminiFileRef {
  fileUri: string;
  mimeType: string;
  name: string;
  displayName: string;
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
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? "Gemini upload failed");
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

/** Colorize a B&W sketch using Gemini 2.0 Flash image gen. Returns base64 + mimeType. */
export async function colorizeSketch(
  imageBase64: string,
  prompt?: string
): Promise<{ base64: string; mimeType: string }> {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode: "colorize", imageBase64, prompt }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? "Gemini colorize failed");
  }
  return res.json();
}
