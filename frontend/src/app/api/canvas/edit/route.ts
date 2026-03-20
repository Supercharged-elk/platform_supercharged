import { NextRequest, NextResponse } from "next/server";
import { getCanvasUser, deductCredit, refundCredit, getServiceClient } from "@/lib/canvas-auth";
import { predictionCache } from "@/lib/prediction-cache";
import { randomUUID } from "crypto";

const DEFAULT_MODEL = "black-forest-labs/flux-kontext-pro";

// Platform model IDs are not UUIDs — skip DB lookup for these
const PLATFORM_EDIT_MODELS: Record<string, string> = {
  "platform-edit-fluxkontextpro": "black-forest-labs/flux-kontext-pro",
};

export async function POST(req: NextRequest) {
  const apiKey = process.env.REPLICATE_API_TOKEN;
  if (!apiKey) return NextResponse.json({ detail: "REPLICATE_API_TOKEN not configured" }, { status: 500 });

  const user = await getCanvasUser(req);
  if (!user) return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { image_url, prompt, model_config_id, workflow_id } = body;
  if (!image_url?.trim()) return NextResponse.json({ detail: "image_url is required" }, { status: 422 });
  if (!prompt?.trim()) return NextResponse.json({ detail: "prompt is required" }, { status: 422 });

  let modelRef = DEFAULT_MODEL;
  if (model_config_id) {
    if (PLATFORM_EDIT_MODELS[model_config_id]) {
      modelRef = PLATFORM_EDIT_MODELS[model_config_id];
    } else {
      const sb = getServiceClient();
      const { data } = await sb.from("model_configs").select("model_ref").eq("id", model_config_id).maybeSingle();
      if (data?.model_ref) modelRef = data.model_ref;
    }
  }

  try {
    await deductCredit(user.userId, "edit");
  } catch {
    return NextResponse.json({ detail: "Insufficient edit credits" }, { status: 402 });
  }

  const genId = randomUUID();
  const supabase = getServiceClient();
  await supabase.from("generations").insert({
    id: genId,
    user_id: user.userId,
    workflow_id: workflow_id ?? null,
    user_prompt: prompt,
    final_prompt: prompt,
    mode: "edit",
    model_used: modelRef,
  });
  await supabase.from("generation_progress").insert({
    generation_id: genId,
    status: "pending",
    progress_pct: 0,
    stage: "Queuing...",
  });

  const repRes = await fetch(`https://api.replicate.com/v1/models/${modelRef}/predictions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", Prefer: "respond-async" },
    body: JSON.stringify({ input: { input_image: image_url, prompt } }),
  });

  if (!repRes.ok) {
    const err = await repRes.text();
    await supabase.from("generation_progress")
      .update({ status: "failed", stage: "Failed" }).eq("generation_id", genId);
    await refundCredit(user.userId, "edit");
    return NextResponse.json({ detail: `Replicate error: ${err}` }, { status: 500 });
  }

  const prediction = await repRes.json();
  predictionCache.set(genId, prediction.id);
  await supabase.from("generations").update({ prediction_id: prediction.id }).eq("id", genId);

  return NextResponse.json({ generation_id: genId });
}
