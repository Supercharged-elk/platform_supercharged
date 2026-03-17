import { NextRequest, NextResponse } from "next/server";
import { logStudioEvent, pipelineFromReferer } from "@/lib/studio-tracking";

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";
/** Text analysis model for vision and video tasks */
const ANALYSIS_MODEL = "gemini-2.5-flash";
/** Image generation model for generate and colorize tasks */
const IMAGE_MODEL = "gemini-3.1-flash-image-preview";

type GeminiMode = "vision" | "generate" | "colorize" | "video";

interface VisionPayload {
  mode: "vision";
  prompt: string;
  images?: string[]; // base64 JPEG/PNG without data: prefix
}

interface GeneratePayload {
  mode: "generate";
  prompt: string;
}

interface ColorizePayload {
  mode: "colorize";
  imageBase64: string;        // base64 without prefix — the B&W sketch
  prompt?: string;
  mimeType?: string;
  referenceBase64?: string;   // optional color reference image
  referenceMimeType?: string;
}

interface VideoPayload {
  mode: "video";
  /** One or more Gemini File API URIs (returned by /api/studio/gemini-upload) */
  fileUris: { uri: string; mimeType: string }[];
  prompt: string;
}

type RequestPayload = VisionPayload | GeneratePayload | ColorizePayload | VideoPayload;

async function callGemini(model: string, apiKey: string, parts: unknown[], modalities: string[]) {
  const res = await fetch(
    `${GEMINI_BASE}/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: { responseModalities: modalities },
      }),
    }
  );
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini error (${res.status}): ${err}`);
  }
  return res.json();
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "GOOGLE_AI_API_KEY not configured" }, { status: 500 });
  }

  let body: RequestPayload;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { mode } = body;

  // ── Vision: text analysis with optional inline images ─────────────────────
  if (mode === "vision") {
    const { prompt, images = [] } = body as VisionPayload;
    const parts: unknown[] = [{ text: prompt }];
    for (const img of images) {
      parts.push({ inline_data: { mime_type: "image/jpeg", data: img } });
    }

    try {
      const data = await callGemini(ANALYSIS_MODEL, apiKey, parts, ["TEXT"]);
      const responseParts = data?.candidates?.[0]?.content?.parts ?? [];
      const text = responseParts.find((p: { text?: string }) => p.text)?.text ?? "";
      void logStudioEvent(req, pipelineFromReferer(req), "prompt_enriched", { image_count: images.length });
      return NextResponse.json({ text });
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
  }

  // ── Generate: text → image ────────────────────────────────────────────────
  if (mode === "generate") {
    const { prompt } = body as GeneratePayload;

    try {
      const data = await callGemini(IMAGE_MODEL, apiKey, [{ text: prompt }], ["IMAGE", "TEXT"]);
      const responseParts = data?.candidates?.[0]?.content?.parts ?? [];
      // Gemini returns camelCase `inlineData` (not snake_case `inline_data`)
      type ImgPart = { inlineData?: { data: string; mimeType: string } };
      const imgPart = responseParts.find((p: ImgPart) => p.inlineData) as ImgPart | undefined;
      if (!imgPart?.inlineData) {
        return NextResponse.json({ error: "No image returned from Gemini" }, { status: 500 });
      }
      return NextResponse.json({
        base64: imgPart.inlineData.data,
        mimeType: imgPart.inlineData.mimeType,
      });
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
  }

  // ── Colorize: B&W image → colorized image ─────────────────────────────────
  if (mode === "colorize") {
    const {
      imageBase64,
      prompt = "Colorize this black and white sketch. Preserve the original line art, stroke style, and illustration character exactly — do NOT render it as a photograph or make it photorealistic. Keep it as an illustration. Apply colors that feel natural to the composition. Return only the colorized image.",
      mimeType,
      referenceBase64,
      referenceMimeType,
    } = body as ColorizePayload;

    const referenceNote = referenceBase64
      ? " The second image is a COLOR REFERENCE. Match its color palette, illustration style, rendering technique, and artistic treatment precisely. Adopt the same level of detail, stroke quality, and visual aesthetic — not just the colors. Do not make the result more photorealistic than the reference."
      : "";

    // Input uses snake_case inline_data (Gemini REST request format)
    const parts: unknown[] = [
      { text: prompt + referenceNote },
      { inline_data: { mime_type: mimeType ?? "image/jpeg", data: imageBase64 } },
    ];

    if (referenceBase64) {
      parts.push({
        inline_data: { mime_type: referenceMimeType ?? "image/jpeg", data: referenceBase64 },
      });
    }

    try {
      const data = await callGemini(IMAGE_MODEL, apiKey, parts, ["IMAGE", "TEXT"]);
      const responseParts = data?.candidates?.[0]?.content?.parts ?? [];
      // Gemini returns camelCase `inlineData` (not snake_case `inline_data`)
      type ImgPart = { inlineData?: { data: string; mimeType: string } };
      const imgPart = responseParts.find((p: ImgPart) => p.inlineData) as ImgPart | undefined;
      if (!imgPart?.inlineData) {
        void logStudioEvent(req, "illustrations", "colorize_failed", { error: "No image returned" });
        return NextResponse.json({ error: "No colorized image returned from Gemini" }, { status: 500 });
      }
      void logStudioEvent(req, "illustrations", "colorize_succeeded", { has_reference: !!(body as ColorizePayload).referenceBase64 });
      return NextResponse.json({
        base64: imgPart.inlineData.data,
        mimeType: imgPart.inlineData.mimeType,
      });
    } catch (e) {
      void logStudioEvent(req, "illustrations", "colorize_failed", { error: (e as Error).message });
      return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
  }

  // ── Video: analyze uploaded videos via Gemini File API ────────────────────
  if (mode === "video") {
    const { fileUris, prompt } = body as VideoPayload;
    const parts: unknown[] = [{ text: prompt }];
    for (const { uri, mimeType } of fileUris) {
      parts.push({ file_data: { mime_type: mimeType, file_uri: uri } });
    }

    try {
      const data = await callGemini(ANALYSIS_MODEL, apiKey, parts, ["TEXT"]);
      const responseParts = data?.candidates?.[0]?.content?.parts ?? [];
      const text = responseParts.find((p: { text?: string }) => p.text)?.text ?? "";
      if (!text.trim()) {
        return NextResponse.json({ error: "Gemini returned no analysis text — the video format may not be supported or the file may have expired." }, { status: 500 });
      }
      return NextResponse.json({ text });
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
  }

  return NextResponse.json({ error: `Unknown mode: ${mode as string}` }, { status: 400 });
}
