import { sleep } from "../utils";

const START_ENDPOINT = "/api/studio/replicate";

interface Prediction {
  id: string;
  status: "starting" | "processing" | "succeeded" | "failed" | "canceled";
  output?: string | string[] | null;
  error?: string | null;
  logs?: string;
}

/** Start a Replicate prediction. Returns the prediction object (id + starting status). */
export async function startPrediction(
  model: string,
  input: Record<string, unknown>
): Promise<Prediction> {
  const res = await fetch(START_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, input }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? "Failed to start Replicate prediction");
  }

  return res.json();
}

/** Poll a prediction by ID until it finishes. Returns the completed prediction. */
export async function pollPrediction(
  id: string,
  intervalMs = 3000,
  maxAttempts = 100
): Promise<Prediction> {
  for (let i = 0; i < maxAttempts; i++) {
    const res = await fetch(`/api/studio/replicate/${id}`, { cache: "no-store" });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error ?? "Failed to poll Replicate prediction");
    }

    const prediction: Prediction = await res.json();

    if (prediction.status === "succeeded" || prediction.status === "failed" || prediction.status === "canceled") {
      return prediction;
    }

    await sleep(intervalMs);
  }

  throw new Error("Replicate prediction timed out");
}

/**
 * Start a prediction and wait for it to finish.
 * Returns the output URL string (first item if array).
 */
export async function waitForPrediction(
  model: string,
  input: Record<string, unknown>,
  intervalMs = 3000
): Promise<string> {
  const started = await startPrediction(model, input);

  // If already done after initial wait=5 from server
  if (started.status === "succeeded") {
    return extractOutput(started);
  }
  if (started.status === "failed") {
    throw new Error(started.error ?? "Replicate prediction failed");
  }

  const completed = await pollPrediction(started.id, intervalMs);

  if (completed.status !== "succeeded") {
    throw new Error(completed.error ?? `Prediction ${completed.status}`);
  }

  return extractOutput(completed);
}

function extractOutput(prediction: Prediction): string {
  const { output } = prediction;
  if (Array.isArray(output)) return output[0] as string;
  if (typeof output === "string") return output;
  throw new Error("Unexpected Replicate output format");
}
