import { NextRequest, NextResponse } from "next/server";
import { getCanvasUser, getServiceClient } from "@/lib/canvas-auth";

const PLATFORM_MODELS = [
  {
    id: "platform-multiref-flux2pro",
    display_name: "FLUX 2 Pro (Multi-Ref)",
    model_ref: "black-forest-labs/flux-2-pro",
    trigger_word: null,
    use_enrichment: false,
  },
  {
    id: "platform-video-kling",
    display_name: "Kling v2.1 (Video)",
    model_ref: "kwaivgi/kling-v2.1",
    trigger_word: null,
    use_enrichment: false,
  },
];

/** GET /api/canvas/models?task=multi_ref|video&project_id=UUID */
export async function GET(req: NextRequest) {
  await getCanvasUser(req); // auth optional for models list

  const { searchParams } = new URL(req.url);
  const task = searchParams.get("task");
  const projectId = searchParams.get("project_id");

  // Platform-wide models (no project needed)
  if (!projectId) {
    let models = PLATFORM_MODELS;
    if (task === "multi_ref") models = models.filter((m) => m.model_ref.includes("flux-2-pro"));
    if (task === "video") models = models.filter((m) => m.model_ref.includes("kling"));
    return NextResponse.json({ models });
  }

  // Project-specific models from Supabase
  const supabase = getServiceClient();
  const query = supabase
    .from("model_configs")
    .select("id, display_name, model_ref, trigger_word, default_params, use_enrichment")
    .eq("project_id", projectId)
    .eq("active", true);

  const { data, error } = await query;
  if (error) return NextResponse.json({ models: PLATFORM_MODELS });

  return NextResponse.json({ models: data ?? PLATFORM_MODELS });
}
