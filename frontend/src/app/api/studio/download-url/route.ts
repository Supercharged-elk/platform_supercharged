import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/studio/download-url
 * Proxies an external URL (e.g. Replicate CDN) through the server so the
 * browser receives it as an attachment. Needed because <a download> is
 * silently ignored for cross-origin URLs — the browser navigates instead.
 */
export async function POST(req: NextRequest) {
  let body: { url: string; filename: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { url, filename } = body;

  if (!url || !filename) {
    return NextResponse.json({ error: "Missing url or filename" }, { status: 400 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(url);
  } catch {
    return NextResponse.json({ error: "Failed to fetch URL" }, { status: 502 });
  }

  if (!upstream.ok) {
    return NextResponse.json({ error: `Upstream error: ${upstream.status}` }, { status: 502 });
  }

  const buffer = Buffer.from(await upstream.arrayBuffer());
  const contentType = upstream.headers.get("content-type") ?? "application/octet-stream";

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": buffer.byteLength.toString(),
    },
  });
}
