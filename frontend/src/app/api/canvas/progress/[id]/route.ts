import { NextRequest, NextResponse } from "next/server";
import { getCanvasUser, getServiceClient } from "@/lib/canvas-auth";
import { predictionCache } from "@/lib/prediction-cache";

/** GET /api/canvas/progress/[id] — poll generation progress */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCanvasUser(req);
  if (!user) return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });

  const { id: generationId } = await params;
  const supabase = getServiceClient();

  // Fetch generation (ownership check) — without prediction_id for forward compatibility
  // (migration 011 adds that column; if not applied the query would 500 if we include it)
  const { data: gen, error: genErr } = await supabase
    .from("generations")
    .select("id, user_id, image_url, video_url, mode")
    .eq("id", generationId)
    .maybeSingle();

  if (genErr) {
    return NextResponse.json({ detail: genErr.message }, { status: 500 });
  }
  if (!gen) return NextResponse.json({ detail: "Generation not found" }, { status: 404 });
  if (gen.user_id !== user.userId) return NextResponse.json({ detail: "Access denied" }, { status: 403 });

  // If already completed in DB, return that
  if (gen.image_url || gen.video_url) {
    return NextResponse.json({
      generation_id: generationId,
      image_url: gen.image_url,
      video_url: gen.video_url,
      progress: { status: "completed", progress_pct: 100, stage: "Done" },
    });
  }

  // Try to get prediction_id separately — requires migration 011.
  // If the column doesn't exist yet (error code 42703), fall through to "pending".
  let predictionId: string | null = null;
  const { data: predRow, error: predErr } = await supabase
    .from("generations")
    .select("prediction_id")
    .eq("id", generationId)
    .maybeSingle();

  if (!predErr && predRow) {
    predictionId = (predRow as Record<string, string | null>).prediction_id ?? null;
  }
  // predErr.code === "42703" means migration 011 not applied — fall back to in-process cache
  if (!predictionId) {
    predictionId = predictionCache.get(generationId) ?? null;
  }

  if (!predictionId) {
    return NextResponse.json({
      generation_id: generationId,
      progress: { status: "pending", progress_pct: 0, stage: "Queuing..." },
    });
  }

  const replicateToken = process.env.REPLICATE_API_TOKEN;
  if (!replicateToken) {
    return NextResponse.json({ detail: "REPLICATE_API_TOKEN not configured" }, { status: 500 });
  }

  const repRes = await fetch(`https://api.replicate.com/v1/predictions/${predictionId}`, {
    headers: { Authorization: `Bearer ${replicateToken}` },
    cache: "no-store",
  });

  if (!repRes.ok) {
    return NextResponse.json({
      generation_id: generationId,
      progress: { status: "processing", progress_pct: 10, stage: "Generating..." },
    });
  }

  const prediction = await repRes.json();
  const repStatus: string = prediction.status;

  if (repStatus === "succeeded") {
    const outputUrl = Array.isArray(prediction.output) ? prediction.output[0] : prediction.output;

    // Update DB
    if (gen.mode === "video") {
      await supabase.from("generations").update({ video_url: outputUrl }).eq("id", generationId);
    } else {
      await supabase.from("generations").update({ image_url: outputUrl }).eq("id", generationId);
    }
    await supabase.from("generation_progress")
      .upsert({ generation_id: generationId, status: "completed", progress_pct: 100, stage: "Done" });

    return NextResponse.json({
      generation_id: generationId,
      image_url: gen.mode !== "video" ? outputUrl : null,
      video_url: gen.mode === "video" ? outputUrl : null,
      progress: { status: "completed", progress_pct: 100, stage: "Done" },
    });
  }

  if (repStatus === "failed" || repStatus === "canceled") {
    await supabase.from("generation_progress")
      .upsert({ generation_id: generationId, status: "failed", progress_pct: 0, stage: "Failed" });
    return NextResponse.json({
      generation_id: generationId,
      progress: {
        status: "failed",
        progress_pct: 0,
        stage: "Failed",
        error_message: prediction.error ?? "Generation failed",
      },
    });
  }

  // Still processing — estimate progress from elapsed time
  const createdAt = prediction.created_at ? new Date(prediction.created_at).getTime() : Date.now();
  const elapsed = (Date.now() - createdAt) / 1000;
  const tau = gen.mode === "video" ? 50 : 10;
  const pct = Math.min(90, Math.floor((1 - Math.exp(-elapsed / tau)) * 100));
  const stage = pct < 12 ? "Queuing..." : pct < 55 ? "Generating..." : pct < 80 ? "Processing..." : "Almost done...";

  return NextResponse.json({
    generation_id: generationId,
    progress: { status: "processing", progress_pct: pct, stage },
  });
}
