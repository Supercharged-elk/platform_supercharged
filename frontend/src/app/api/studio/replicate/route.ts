import { NextRequest, NextResponse } from "next/server";

interface StartPayload {
  model: string; // e.g. "kwaivgi/kling-v2.1"
  input: Record<string, unknown>;
}

export async function POST(req: NextRequest) {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) {
    return NextResponse.json({ error: "REPLICATE_API_TOKEN not configured" }, { status: 500 });
  }

  let body: StartPayload;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { model, input } = body;

  const res = await fetch("https://api.replicate.com/v1/predictions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      Prefer: "wait=5",
    },
    body: JSON.stringify({ model, input }),
  });

  if (!res.ok) {
    const err = await res.text();
    return NextResponse.json({ error: `Replicate error: ${err}` }, { status: res.status });
  }

  const data = await res.json();
  return NextResponse.json(data);
}
