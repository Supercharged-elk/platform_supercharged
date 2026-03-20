import { NextRequest, NextResponse } from "next/server";

const PLATFORM_MODELS = [
  {
    id: "platform-generate-flux11pro",
    display_name: "FLUX 1.1 Pro",
    model_ref: "black-forest-labs/flux-1.1-pro",
    trigger_word: null,
    use_enrichment: false,
  },
  {
    id: "platform-edit-fluxkontextpro",
    display_name: "FLUX Kontext Pro (Edit)",
    model_ref: "black-forest-labs/flux-kontext-pro",
    trigger_word: null,
    use_enrichment: false,
  },
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

/** GET /api/canvas/models/global?task=generate|multi_ref|video */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const task = searchParams.get("task");

  let models = PLATFORM_MODELS;
  if (task === "generate") models = models.filter((m) => m.model_ref.includes("flux-1.1-pro"));
  else if (task === "edit") models = models.filter((m) => m.model_ref.includes("kontext"));
  else if (task === "multi_ref") models = models.filter((m) => m.model_ref.includes("flux-2-pro"));
  else if (task === "video") models = models.filter((m) => m.model_ref.includes("kling"));

  return NextResponse.json({ models });
}
