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
export const runtime = "nodejs";

const UPLOAD_BASE = "https://generativelanguage.googleapis.com/upload/v1beta";
const API_BASE = "https://generativelanguage.googleapis.com/v1beta";
const DEFAULT_RESUMABLE_THRESHOLD_MB = 8;

type UploadErrorCode =
  | "MISSING_API_KEY"
  | "FILE_TOO_LARGE"
  | "UNSUPPORTED_MIME"
  | "UPLOAD_TIMEOUT"
  | "UPSTREAM_ERROR"
  | "INVALID_FORM";

class UploadRouteError extends Error {
  code: UploadErrorCode;
  status: number;
  retryable: boolean;
  details?: string;

  constructor(
    code: UploadErrorCode,
    message: string,
    status: number,
    retryable = false,
    details?: string
  ) {
    super(message);
    this.code = code;
    this.status = status;
    this.retryable = retryable;
    this.details = details;
  }
}

const SUPPORTED_MEDIA_MIME_TYPES = new Set([
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "video/x-matroska",
  "image/png",
  "image/jpeg",
  "image/webp",
]);

function getResumableThresholdBytes() {
  const fromEnv = Number(process.env.RF_RESUMABLE_THRESHOLD_MB);
  const thresholdMb = Number.isFinite(fromEnv) && fromEnv > 0 ? fromEnv : DEFAULT_RESUMABLE_THRESHOLD_MB;
  return Math.floor(thresholdMb * 1024 * 1024);
}

function jsonUploadError(err: UploadRouteError) {
  return NextResponse.json(
    {
      code: err.code,
      message: err.message,
      retryable: err.retryable,
      details: err.details,
      error: err.message,
    },
    { status: err.status }
  );
}

function parseUpstreamError(raw: string) {
  try {
    const data = JSON.parse(raw) as { error?: { message?: string; status?: string; code?: number } };
    return data.error?.message ?? raw;
  } catch {
    return raw;
  }
}

type StartUploadRequest = {
  action: "start";
  mimeType?: string;
  displayName?: string;
  fileSize?: number;
};

type FinalizeUploadRequest = {
  action: "finalize";
  fileName?: string;
  mimeType?: string;
  displayName?: string;
  fileUri?: string;
  state?: string;
};

type UploadChunkActionRequest = {
  action: "chunk";
  uploadUrl?: string;
  offset?: number;
  finalize?: boolean;
  mimeType?: string;
};

type UploadActionRequest = StartUploadRequest | FinalizeUploadRequest | UploadChunkActionRequest;

async function pollUntilActive(
  fileName: string,
  apiKey: string,
  maxWaitMs = 280_000
): Promise<void> {
  const deadline = Date.now() + maxWaitMs;
  let waitMs = 2000;
  while (Date.now() < deadline) {
    const res = await fetch(`${API_BASE}/${fileName}?key=${apiKey}`);
    if (!res.ok) {
      const raw = await res.text();
      throw new UploadRouteError(
        "UPSTREAM_ERROR",
        `File status check failed: ${parseUpstreamError(raw)}`,
        502,
        true,
        `status=${res.status}`
      );
    }
    const data = await res.json();
    if (data.state === "ACTIVE") return;
    if (data.state === "FAILED") {
      throw new UploadRouteError(
        "UPSTREAM_ERROR",
        "Gemini file processing failed",
        502,
        true
      );
    }
    await new Promise((r) => setTimeout(r, waitMs));
    waitMs = Math.min(waitMs * 2, 8000);
  }
  throw new UploadRouteError("UPLOAD_TIMEOUT", "Gemini file processing timed out", 504, true);
}

async function startResumableSession(params: {
  apiKey: string;
  mimeType: string;
  displayName: string;
  fileSize: number;
}) {
  const { apiKey, mimeType, displayName, fileSize } = params;
  const startRes = await fetch(`${UPLOAD_BASE}/files?key=${apiKey}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Upload-Protocol": "resumable",
      "X-Goog-Upload-Command": "start",
      "X-Goog-Upload-Header-Content-Type": mimeType,
      "X-Goog-Upload-Header-Content-Length": String(fileSize),
    },
    body: JSON.stringify({ file: { display_name: displayName } }),
  });

  if (!startRes.ok) {
    const raw = await startRes.text();
    throw new UploadRouteError(
      "UPSTREAM_ERROR",
      `Gemini resumable start failed: ${parseUpstreamError(raw)}`,
      startRes.status >= 400 && startRes.status < 500 ? 400 : 502,
      startRes.status >= 500,
      `status=${startRes.status}`
    );
  }

  const uploadUrl = startRes.headers.get("x-goog-upload-url");
  if (!uploadUrl) {
    throw new UploadRouteError("UPSTREAM_ERROR", "Gemini resumable upload URL missing", 502, true);
  }

  return { uploadUrl, mimeType, displayName };
}

async function uploadMultipart(params: {
  apiKey: string;
  mimeType: string;
  displayName: string;
  fileBuffer: ArrayBuffer;
}) {
  const { apiKey, mimeType, displayName, fileBuffer } = params;
  const boundary = `_gemini_${Date.now()}_`;
  const metaJson = JSON.stringify({ file: { display_name: displayName } });

  const enc = new TextEncoder();
  const head = enc.encode(
    `--${boundary}\r\n` +
      "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
      `${metaJson}\r\n` +
      `--${boundary}\r\n` +
      `Content-Type: ${mimeType}\r\n\r\n`
  );
  const tail = enc.encode(`\r\n--${boundary}--`);

  const body = new Uint8Array(head.byteLength + fileBuffer.byteLength + tail.byteLength);
  body.set(head, 0);
  body.set(new Uint8Array(fileBuffer), head.byteLength);
  body.set(tail, head.byteLength + fileBuffer.byteLength);

  const uploadRes = await fetch(`${UPLOAD_BASE}/files?uploadType=multipart&key=${apiKey}`, {
    method: "POST",
    headers: {
      "Content-Type": `multipart/related; boundary=${boundary}`,
    },
    body,
  });

  if (!uploadRes.ok) {
    const raw = await uploadRes.text();
    throw new UploadRouteError(
      "UPSTREAM_ERROR",
      `Gemini upload error: ${parseUpstreamError(raw)}`,
      uploadRes.status >= 400 && uploadRes.status < 500 ? 400 : 502,
      uploadRes.status >= 500,
      `status=${uploadRes.status}`
    );
  }

  return uploadRes.json();
}

async function uploadResumable(params: {
  apiKey: string;
  mimeType: string;
  displayName: string;
  fileBuffer: ArrayBuffer;
}) {
  const { apiKey, mimeType, displayName, fileBuffer } = params;

  const startRes = await fetch(`${UPLOAD_BASE}/files?key=${apiKey}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Upload-Protocol": "resumable",
      "X-Goog-Upload-Command": "start",
      "X-Goog-Upload-Header-Content-Type": mimeType,
      "X-Goog-Upload-Header-Content-Length": String(fileBuffer.byteLength),
    },
    body: JSON.stringify({ file: { display_name: displayName } }),
  });

  if (!startRes.ok) {
    const raw = await startRes.text();
    throw new UploadRouteError(
      "UPSTREAM_ERROR",
      `Gemini resumable start failed: ${parseUpstreamError(raw)}`,
      startRes.status >= 400 && startRes.status < 500 ? 400 : 502,
      startRes.status >= 500,
      `status=${startRes.status}`
    );
  }

  const uploadUrl = startRes.headers.get("x-goog-upload-url");
  if (!uploadUrl) {
    throw new UploadRouteError(
      "UPSTREAM_ERROR",
      "Gemini resumable upload URL missing",
      502,
      true
    );
  }

  const uploadRes = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      "Content-Type": mimeType,
      "X-Goog-Upload-Command": "upload, finalize",
      "X-Goog-Upload-Offset": "0",
    },
    body: fileBuffer,
  });

  if (!uploadRes.ok) {
    const raw = await uploadRes.text();
    throw new UploadRouteError(
      "UPSTREAM_ERROR",
      `Gemini resumable upload failed: ${parseUpstreamError(raw)}`,
      uploadRes.status >= 400 && uploadRes.status < 500 ? 400 : 502,
      uploadRes.status >= 500,
      `status=${uploadRes.status}`
    );
  }

  return uploadRes.json();
}

async function proxyResumableChunk(params: {
  uploadUrl: string;
  offset: number;
  finalize: boolean;
  mimeType: string;
  chunkBuffer: ArrayBuffer;
}) {
  const { uploadUrl, offset, finalize, mimeType, chunkBuffer } = params;
  const command = finalize ? "upload, finalize" : "upload";
  const upstream = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      "Content-Type": mimeType,
      "X-Goog-Upload-Offset": String(offset),
      "X-Goog-Upload-Command": command,
    },
    body: chunkBuffer,
  });

  if (!upstream.ok) {
    const raw = await upstream.text();
    throw new UploadRouteError(
      "UPSTREAM_ERROR",
      `Gemini chunk upload failed: ${parseUpstreamError(raw)}`,
      upstream.status >= 400 && upstream.status < 500 ? 400 : 502,
      upstream.status >= 500,
      `status=${upstream.status}`
    );
  }

  if (!finalize) {
    return { uploaded: true, nextOffset: offset + chunkBuffer.byteLength };
  }

  const data = (await upstream.json()) as {
    file?: { name?: string; uri?: string; mimeType?: string; displayName?: string; state?: string };
  };
  return {
    uploaded: true,
    finalized: true,
    fileName: data.file?.name,
    fileUri: data.file?.uri,
    mimeType: data.file?.mimeType,
    displayName: data.file?.displayName,
    state: data.file?.state,
  };
}

export async function POST(req: NextRequest) {
  const startedAt = Date.now();
  let uploadMode: "multipart" | "resumable" = "multipart";
  let mimeType = "video/mp4";
  let fileSize = 0;

  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) {
    return jsonUploadError(
      new UploadRouteError("MISSING_API_KEY", "GOOGLE_AI_API_KEY not configured", 500)
    );
  }

  let formData: FormData;
  const contentType = req.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    try {
      const body = (await req.json()) as UploadActionRequest;

      if (body.action === "start") {
        mimeType = body.mimeType || "video/mp4";
        const displayName = body.displayName || "upload";
        fileSize = Number(body.fileSize || 0);

        if (!SUPPORTED_MEDIA_MIME_TYPES.has(mimeType)) {
          return jsonUploadError(
            new UploadRouteError(
              "UNSUPPORTED_MIME",
              "Unsupported media format. Use MP4, MOV, WebM, PNG, JPEG, or WebP.",
              415
            )
          );
        }
        if (!Number.isFinite(fileSize) || fileSize <= 0) {
          return jsonUploadError(
            new UploadRouteError("INVALID_FORM", "Invalid file size for upload start", 400)
          );
        }

        uploadMode = "resumable";
        const start = await startResumableSession({ apiKey, mimeType, displayName, fileSize });
        return NextResponse.json(start);
      }

      if (body.action === "finalize") {
        const fileName = body.fileName || "";
        const displayName = body.displayName || "upload";
        const fallbackMimeType = body.mimeType || "video/mp4";
        const knownUri = body.fileUri;
        const knownState = body.state;
        if (!fileName) {
          return jsonUploadError(new UploadRouteError("INVALID_FORM", "Missing fileName", 400));
        }

        uploadMode = "resumable";
        if (knownState && knownState !== "ACTIVE") {
          await pollUntilActive(fileName, apiKey);
        } else if (!knownState) {
          const preRes = await fetch(`${API_BASE}/${fileName}?key=${apiKey}`);
          if (!preRes.ok) {
            const raw = await preRes.text();
            throw new UploadRouteError(
              "UPSTREAM_ERROR",
              `File status check failed: ${parseUpstreamError(raw)}`,
              502,
              true,
              `status=${preRes.status}`
            );
          }
          const preData = (await preRes.json()) as { state?: string };
          if (preData.state !== "ACTIVE") {
            await pollUntilActive(fileName, apiKey);
          }
        }

        const res = await fetch(`${API_BASE}/${fileName}?key=${apiKey}`);
        if (!res.ok) {
          const raw = await res.text();
          throw new UploadRouteError(
            "UPSTREAM_ERROR",
            `File fetch failed: ${parseUpstreamError(raw)}`,
            502,
            true,
            `status=${res.status}`
          );
        }
        const data = (await res.json()) as {
          uri?: string;
          mimeType?: string;
          name?: string;
          displayName?: string;
        };
        return NextResponse.json({
          fileUri: data.uri || knownUri,
          mimeType: data.mimeType || fallbackMimeType,
          name: data.name || fileName,
          displayName: data.displayName || displayName,
        });
      }

      return jsonUploadError(new UploadRouteError("INVALID_FORM", "Unknown upload action", 400));
    } catch (err) {
      if (err instanceof UploadRouteError) return jsonUploadError(err);
      const message = err instanceof Error ? err.message : "Invalid upload JSON payload";
      return jsonUploadError(new UploadRouteError("INVALID_FORM", message, 400));
    } finally {
      const elapsedMs = Date.now() - startedAt;
      console.info(
        JSON.stringify({
          event: "studio_gemini_upload",
          uploadMode,
          mimeType,
          fileSize,
          elapsedMs,
        })
      );
    }
  }

  try {
    formData = await req.formData();
  } catch {
    return jsonUploadError(new UploadRouteError("INVALID_FORM", "Invalid multipart form data", 400));
  }

  const multipartAction = String(formData.get("action") || "").toLowerCase();
  if (multipartAction === "chunk") {
    try {
      const uploadUrl = String(formData.get("uploadUrl") || "");
      const offset = Number(formData.get("offset") || 0);
      const finalize = String(formData.get("finalize") || "0") === "1";
      const chunk = formData.get("chunk") as File | null;
      const chunkMimeType = String(formData.get("mimeType") || chunk?.type || "application/octet-stream");

      if (!uploadUrl || !Number.isFinite(offset) || offset < 0 || !chunk) {
        return jsonUploadError(new UploadRouteError("INVALID_FORM", "Invalid chunk payload", 400));
      }

      const chunkBuffer = await chunk.arrayBuffer();
      const chunkResult = await proxyResumableChunk({
        uploadUrl,
        offset,
        finalize,
        mimeType: chunkMimeType,
        chunkBuffer,
      });
      return NextResponse.json(chunkResult);
    } catch (err) {
      if (err instanceof UploadRouteError) return jsonUploadError(err);
      const message = err instanceof Error ? err.message : "Chunk upload failed";
      return jsonUploadError(new UploadRouteError("UPSTREAM_ERROR", message, 502, true));
    } finally {
      const elapsedMs = Date.now() - startedAt;
      console.info(
        JSON.stringify({
          event: "studio_gemini_upload_chunk",
          uploadMode: "resumable",
          elapsedMs,
        })
      );
    }
  }

  const file = formData.get("file") as File | null;
  if (!file) {
    return jsonUploadError(
      new UploadRouteError("INVALID_FORM", "No file field in form data", 400)
    );
  }

  mimeType = file.type || "video/mp4";
  const displayName = file.name || "upload";
  fileSize = file.size;

  if (!SUPPORTED_MEDIA_MIME_TYPES.has(mimeType)) {
    return jsonUploadError(
      new UploadRouteError(
        "UNSUPPORTED_MIME",
        "Unsupported media format. Use MP4, MOV, WebM, PNG, JPEG, or WebP.",
        415
      )
    );
  }

  try {
    const fileBuffer = await file.arrayBuffer();
    const resumableThresholdBytes = getResumableThresholdBytes();
    const resumableEnabled = process.env.RF_RESUMABLE_UPLOAD !== "0";

    let uploadData: { file?: { state?: string; name: string; uri: string; mimeType?: string; displayName?: string } };
    if (resumableEnabled && fileSize >= resumableThresholdBytes) {
      uploadMode = "resumable";
      uploadData = (await uploadResumable({
        apiKey,
        mimeType,
        displayName,
        fileBuffer,
      })) as typeof uploadData;
    } else {
      uploadMode = "multipart";
      uploadData = (await uploadMultipart({
        apiKey,
        mimeType,
        displayName,
        fileBuffer,
      })) as typeof uploadData;
    }

    const geminiFile = uploadData.file;
    if (!geminiFile?.name || !geminiFile?.uri) {
      throw new UploadRouteError("UPSTREAM_ERROR", "Gemini upload response missing file metadata", 502, true);
    }

    // If state is already ACTIVE (small files), skip polling
    if (geminiFile.state !== "ACTIVE") {
      await pollUntilActive(geminiFile.name, apiKey);
    }

    return NextResponse.json({
      fileUri: geminiFile.uri,
      mimeType: geminiFile.mimeType || mimeType,
      name: geminiFile.name,
      displayName: geminiFile.displayName || displayName,
    });
  } catch (err) {
    if (err instanceof UploadRouteError) return jsonUploadError(err);
    const message = err instanceof Error ? err.message : "Unknown upload error";
    return jsonUploadError(new UploadRouteError("UPSTREAM_ERROR", message, 502, true));
  } finally {
    const elapsedMs = Date.now() - startedAt;
    console.info(
      JSON.stringify({
        event: "studio_gemini_upload",
        uploadMode,
        mimeType,
        fileSize,
        elapsedMs,
      })
    );
  }
}
