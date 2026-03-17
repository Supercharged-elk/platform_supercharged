import { NextRequest, NextResponse } from "next/server";
import { logStudioEvent, pipelineFromReferer } from "@/lib/studio-tracking";

/**
 * POST /api/studio/download
 * Converts a base64 string to a binary file and returns it with
 * Content-Disposition: attachment so the browser downloads it directly.
 *
 * Client-side approaches (data: URLs, atob+Uint8Array+Blob) fail silently
 * in Next.js for files above ~1 MB due to CSP and browser limits.
 * Node.js Buffer.from() is reliable for any size.
 */
export async function POST(req: NextRequest) {
  let body: { base64: string; mimeType: string; filename: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { base64, mimeType, filename } = body;

  if (!base64 || !mimeType || !filename) {
    return NextResponse.json({ error: "Missing base64, mimeType or filename" }, { status: 400 });
  }

  let buffer: Buffer;
  try {
    buffer = Buffer.from(base64, "base64");
  } catch {
    return NextResponse.json({ error: "Invalid base64 data" }, { status: 400 });
  }

  void logStudioEvent(req, pipelineFromReferer(req), "download_single", { filename });
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": mimeType,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": buffer.byteLength.toString(),
    },
  });
}
