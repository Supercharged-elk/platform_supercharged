/** Convert a File to a base64 string (without data: prefix) */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/** Convert a File to a full data URL */
export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/** Convert base64 to a data URL */
export function base64ToDataUrl(base64: string, mimeType = "image/jpeg"): string {
  return `data:${mimeType};base64,${base64}`;
}

/**
 * Extract N evenly-spaced frames from a video File.
 * Returns array of base64 JPEG strings (no data: prefix).
 * Must run in browser (uses HTMLVideoElement + Canvas API).
 */
export function extractVideoFrames(file: File, count = 4): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    const objectUrl = URL.createObjectURL(file);
    video.src = objectUrl;
    video.crossOrigin = "anonymous";
    video.preload = "metadata";

    video.onloadedmetadata = () => {
      const duration = video.duration;
      const times = Array.from({ length: count }, (_, i) =>
        (duration / (count + 1)) * (i + 1)
      );

      const frames: string[] = new Array(count).fill("");
      let remaining = count;

      times.forEach((time, index) => {
        const vid = document.createElement("video");
        vid.src = objectUrl;
        vid.crossOrigin = "anonymous";
        vid.currentTime = time;

        vid.onseeked = () => {
          const canvas = document.createElement("canvas");
          const maxW = 640;
          const scale = Math.min(1, maxW / vid.videoWidth);
          canvas.width = Math.round(vid.videoWidth * scale);
          canvas.height = Math.round(vid.videoHeight * scale);
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            remaining--;
            if (remaining === 0) {
              URL.revokeObjectURL(objectUrl);
              resolve(frames.filter(Boolean));
            }
            return;
          }
          ctx.drawImage(vid, 0, 0, canvas.width, canvas.height);
          frames[index] = canvas.toDataURL("image/jpeg", 0.8).split(",")[1];
          remaining--;
          if (remaining === 0) {
            URL.revokeObjectURL(objectUrl);
            resolve(frames.filter(Boolean));
          }
        };

        vid.onerror = () => {
          remaining--;
          if (remaining === 0) {
            URL.revokeObjectURL(objectUrl);
            resolve(frames.filter(Boolean));
          }
        };
      });
    };

    video.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Failed to load video"));
    };
  });
}

/** Sleep for ms milliseconds */
export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Download a base64-encoded file via the server-side /api/studio/download endpoint.
 * Client-side approaches (data: URLs, atob+Uint8Array+Blob) fail silently
 * for large files in Next.js. The server uses Node.js Buffer which is reliable
 * for any size and bypasses all CSP / browser restrictions.
 */
export async function downloadBase64(
  base64: string,
  mimeType: string,
  filename: string
): Promise<void> {
  const res = await fetch("/api/studio/download", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ base64, mimeType, filename }),
  });

  if (!res.ok) throw new Error(`Download failed: ${res.statusText}`);

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}

/**
 * Bundle multiple files into a ZIP and trigger a single download.
 * Accepts base64 strings (images) or remote URLs (videos).
 */
export async function downloadAsZip(
  items: ({ base64: string; mimeType: string } | { url: string })[],
  filenames: string[],
  zipFilename: string
): Promise<void> {
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();

  await Promise.all(
    items.map(async (item, i) => {
      const filename = filenames[i];
      if ("base64" in item) {
        zip.file(filename, item.base64, { base64: true });
      } else {
        const res = await fetch(item.url);
        const blob = await res.blob();
        zip.file(filename, blob);
      }
    })
  );

  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = zipFilename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}

/** Generate a simple random ID */
export function nanoid(): string {
  return Math.random().toString(36).slice(2, 10);
}

/** Run tasks with at most `concurrency` running simultaneously. */
export async function pLimit<T>(
  concurrency: number,
  tasks: (() => Promise<T>)[]
): Promise<T[]> {
  const results: T[] = [];
  let i = 0;
  async function worker(): Promise<void> {
    while (i < tasks.length) {
      const idx = i++;
      results[idx] = await tasks[idx]();
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, worker));
  return results;
}
