import { sleep } from "../utils";

const START_ENDPOINT = "/api/studio/wavespeed";

interface WavespeedPrediction {
  id: string;
  status: "queued" | "processing" | "completed" | "failed";
  outputs?: string[];
  error?: string;
  data?: {
    id: string;
    status: "queued" | "processing" | "completed" | "failed";
    outputs?: string[];
    error?: string;
  };
}

function normalize(p: WavespeedPrediction): { status: string; outputs?: string[]; error?: string } {
  if (p.data) return p.data;
  return p;
}

/** Start a WaveSpeed prediction. */
export async function startWavespeedPrediction(
  model: string,
  input: Record<string, unknown>
): Promise<WavespeedPrediction> {
  const res = await fetch(START_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, input }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? "Failed to start WaveSpeed prediction");
  }
  return res.json();
}

/** Poll a WaveSpeed prediction until completed or failed. */
export async function pollWavespeedPrediction(
  id: string,
  intervalMs = 3000,
  maxAttempts = 120
): Promise<WavespeedPrediction> {
  for (let i = 0; i < maxAttempts; i++) {
    const res = await fetch(`/api/studio/wavespeed/${id}`, { cache: "no-store" });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error ?? "Failed to poll WaveSpeed prediction");
    }
    const prediction: WavespeedPrediction = await res.json();
    const norm = normalize(prediction);
    if (norm.status === "completed" || norm.status === "failed") {
      return prediction;
    }
    await sleep(intervalMs);
  }
  throw new Error("WaveSpeed prediction timed out");
}

/** Start and wait for a WaveSpeed prediction. Returns output URL. */
export async function waitForWavespeedPrediction(
  model: string,
  input: Record<string, unknown>,
  intervalMs = 3000
): Promise<string> {
  const started = await startWavespeedPrediction(model, input);

  // Already done on first response (unlikely but possible)
  const startedNorm = normalize(started);
  if (startedNorm.status === "completed") return extractOutput(started);
  if (startedNorm.status === "failed") throw new Error(startedNorm.error ?? "WaveSpeed prediction failed");

  const completed = await pollWavespeedPrediction(started.id, intervalMs);
  const completedNorm = normalize(completed);
  if (completedNorm.status !== "completed") {
    throw new Error(completedNorm.error ?? `WaveSpeed prediction ${completedNorm.status}`);
  }
  return extractOutput(completed);
}

function extractOutput(p: WavespeedPrediction): string {
  const out = p.outputs?.[0] ?? p.data?.outputs?.[0];
  if (!out) throw new Error("WaveSpeed returned no output");
  return out;
}
