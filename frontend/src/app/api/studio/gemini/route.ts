import { NextRequest, NextResponse } from "next/server";

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
  imageBase64: string; // base64 without prefix
  prompt?: string;
  mimeType?: string;
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
      prompt = "Colorize this black and white sketch with vibrant, realistic colors. Keep the original lines and composition intact. Return only the colorized image.",
      mimeType,
    } = body as ColorizePayload;

    // Input uses snake_case inline_data (Gemini REST request format)
    const parts: unknown[] = [
      { text: prompt },
      { inline_data: { mime_type: mimeType ?? "image/jpeg", data: imageBase64 } },
    ];

    try {
      const data = await callGemini(IMAGE_MODEL, apiKey, parts, ["IMAGE", "TEXT"]);
      const responseParts = data?.candidates?.[0]?.content?.parts ?? [];
      // Gemini returns camelCase `inlineData` (not snake_case `inline_data`)
      type ImgPart = { inlineData?: { data: string; mimeType: string } };
      const imgPart = responseParts.find((p: ImgPart) => p.inlineData) as ImgPart | undefined;
      if (!imgPart?.inlineData) {
        return NextResponse.json({ error: "No colorized image returned from Gemini" }, { status: 500 });
      }
      return NextResponse.json({
        base64: imgPart.inlineData.data,
        mimeType: imgPart.inlineData.mimeType,
      });
    } catch (e) {
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
      return NextResponse.json({ text });
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
  }

  return NextResponse.json({ error: `Unknown mode: ${mode as string}` }, { status: 400 });
}
