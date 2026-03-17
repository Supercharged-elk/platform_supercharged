/**
 * POST /api/studio/wavespeed
 * Start a WaveSpeed prediction.
 * Returns the prediction object { id, status, ... }
 */
import { NextRequest, NextResponse } from "next/server";
import { logStudioEvent } from "@/lib/studio-tracking";

const WAVESPEED_BASE = "https://api.wavespeed.ai/api/v2";

interface StartPayload {
  model: string; // e.g. "wavespeed-ai/wan-2.2/image-to-video-lora"
  input: Record<string, unknown>;
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.WAVESPEED_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "WAVESPEED_API_KEY not configured" }, { status: 500 });
  }

  let body: StartPayload;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { model, input } = body;

  const res = await fetch(`${WAVESPEED_BASE}/${model}/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(input),
  });

  if (!res.ok) {
    const err = await res.text();
    return NextResponse.json(
      { error: `WaveSpeed error (${res.status}): ${err}` },
      { status: res.status }
    );
  }

  const data = await res.json();
  void logStudioEvent(req, "illustrations", "video_started", { model });
  return NextResponse.json(data);
}
