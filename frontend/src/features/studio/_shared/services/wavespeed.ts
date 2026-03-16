import { sleep } from "../utils";

const START_ENDPOINT = "/api/studio/wavespeed";

interface WavespeedPrediction {
  id: string;
  status: "queued" | "processing" | "completed" | "failed";
  outputs?: string[];
  error?: string;
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
    if (prediction.status === "completed" || prediction.status === "failed") {
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
  if (started.status === "completed") return extractOutput(started);
  if (started.status === "failed") throw new Error(started.error ?? "WaveSpeed prediction failed");

  const completed = await pollWavespeedPrediction(started.id, intervalMs);
  if (completed.status !== "completed") {
    throw new Error(completed.error ?? `WaveSpeed prediction ${completed.status}`);
  }
  return extractOutput(completed);
}

function extractOutput(p: WavespeedPrediction): string {
  const out = p.outputs?.[0];
  if (!out) throw new Error("WaveSpeed returned no output");
  return out;
}
