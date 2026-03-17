/**
 * GET /api/studio/wavespeed/[id]
 * Poll a WaveSpeed prediction by ID.
 */
import { NextRequest, NextResponse } from "next/server";

const WAVESPEED_BASE = "https://api.wavespeed.ai/api/v2";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const apiKey = process.env.WAVESPEED_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "WAVESPEED_API_KEY not configured" }, { status: 500 });
  }

  const res = await fetch(`${WAVESPEED_BASE}/predictions/${params.id}/result`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    cache: "no-store",
  });

  if (!res.ok) {
    const err = await res.text();
    return NextResponse.json(
      { error: `WaveSpeed poll error (${res.status}): ${err}` },
      { status: res.status }
    );
  }

  const data = await res.json();
  return NextResponse.json(data);
}
