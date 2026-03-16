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
 * Trigger a browser download for a base64-encoded file.
 * Uses Blob + createObjectURL — reliable for large files (1-2 MB+).
 * data: URLs fail silently in Chrome/Safari above ~1 MB.
 */
export function downloadBase64(base64: string, mimeType: string, filename: string): void {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const blob = new Blob([bytes], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Revoke after a short delay so the browser has time to start the download
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Trigger staggered downloads for multiple base64 files.
 * Uses setTimeout (not await) so the browser's user-gesture context is
 * preserved for each individual download.
 */
export function downloadAllBase64(
  items: { base64: string; mimeType: string; filename: string }[]
): void {
  items.forEach((item, i) => {
    setTimeout(() => downloadBase64(item.base64, item.mimeType, item.filename), i * 600);
  });
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
