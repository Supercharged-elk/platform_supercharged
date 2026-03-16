/**
 * POST /api/studio/gemini-upload
 * Uploads a video (or image) file to the Gemini File API and waits until it's ACTIVE.
 * Returns { fileUri, mimeType, name }.
 *
 * The Gemini File API stores files for 48 hours.
 * Max file size limited by Vercel body limit (~4.5 MB on Hobby, ~50 MB on Pro).
 * For large files, use resumable upload (future work).
 */
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 300; // seconds — Vercel Pro required for > 10 s

const UPLOAD_BASE = "https://generativelanguage.googleapis.com/upload/v1beta";
const API_BASE = "https://generativelanguage.googleapis.com/v1beta";

async function pollUntilActive(
  fileName: string,
  apiKey: string,
  maxWaitMs = 280_000
): Promise<void> {
  const deadline = Date.now() + maxWaitMs;
  let waitMs = 2000;
  while (Date.now() < deadline) {
    const res = await fetch(`${API_BASE}/${fileName}?key=${apiKey}`);
    if (!res.ok) throw new Error(`File status check failed: ${await res.text()}`);
    const data = await res.json();
    if (data.state === "ACTIVE") return;
    if (data.state === "FAILED") throw new Error("Gemini file processing failed");
    await new Promise((r) => setTimeout(r, waitMs));
    waitMs = Math.min(waitMs * 2, 8000);
  }
  throw new Error("Gemini file processing timed out");
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "GOOGLE_AI_API_KEY not configured" }, { status: 500 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid multipart form data" }, { status: 400 });
  }

  const file = formData.get("file") as File | null;
  if (!file) {
    return NextResponse.json({ error: "No file field in form data" }, { status: 400 });
  }

  const mimeType = file.type || "video/mp4";
  const displayName = file.name || "upload";
  const fileBuffer = await file.arrayBuffer();

  // Build a multipart/related body for Gemini's upload endpoint
  const boundary = `_gemini_${Date.now()}_`;
  const metaJson = JSON.stringify({ file: { display_name: displayName } });

  const enc = new TextEncoder();
  const head = enc.encode(
    `--${boundary}\r\n` +
      `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
      `${metaJson}\r\n` +
      `--${boundary}\r\n` +
      `Content-Type: ${mimeType}\r\n\r\n`
  );
  const tail = enc.encode(`\r\n--${boundary}--`);

  const body = new Uint8Array(head.byteLength + fileBuffer.byteLength + tail.byteLength);
  body.set(head, 0);
  body.set(new Uint8Array(fileBuffer), head.byteLength);
  body.set(tail, head.byteLength + fileBuffer.byteLength);

  const uploadRes = await fetch(
    `${UPLOAD_BASE}/files?uploadType=multipart&key=${apiKey}`,
    {
      method: "POST",
      headers: {
        "Content-Type": `multipart/related; boundary=${boundary}`,
        "Content-Length": body.byteLength.toString(),
      },
      body,
    }
  );

  if (!uploadRes.ok) {
    const err = await uploadRes.text();
    return NextResponse.json({ error: `Gemini upload error: ${err}` }, { status: uploadRes.status });
  }

  const { file: geminiFile } = await uploadRes.json();

  // If state is already ACTIVE (small files), skip polling
  if (geminiFile.state !== "ACTIVE") {
    try {
      await pollUntilActive(geminiFile.name, apiKey);
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
  }

  return NextResponse.json({
    fileUri: geminiFile.uri,
    mimeType: geminiFile.mimeType || mimeType,
    name: geminiFile.name,
    displayName: geminiFile.displayName || displayName,
  });
}
