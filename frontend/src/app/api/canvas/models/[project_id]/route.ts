import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/canvas-auth";

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

/** GET /api/canvas/models/[project_id]?task=... */
export async function GET(req: NextRequest, { params }: { params: Promise<{ project_id: string }> }) {
  const { project_id } = await params;
  const { searchParams } = new URL(req.url);
  const task = searchParams.get("task");

  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("model_configs")
    .select("id, display_name, model_ref, trigger_word, default_params, use_enrichment")
    .eq("project_id", project_id)
    .eq("active", true);

  if (error) return NextResponse.json({ models: PLATFORM_MODELS });

  let models = data ?? PLATFORM_MODELS;
  if (task === "multi_ref") {
    models = models.filter((m) => m.model_ref?.includes("flux-2-pro"));
  }

  return NextResponse.json({ models });
}
