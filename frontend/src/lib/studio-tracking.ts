import { createServerClient } from "@supabase/ssr";
import type { NextRequest } from "next/server";

export type StudioPipeline = "illustrations" | "real_footage";

/** Infer pipeline from the Referer header. Falls back to "illustrations". */
export function pipelineFromReferer(req: NextRequest): StudioPipeline {
  const ref = req.headers.get("referer") ?? "";
  return ref.includes("/studio/real-footage") ? "real_footage" : "illustrations";
}

/**
 * Log a studio usage event server-side.
 * - Reads the user session from request cookies (anon key, read-only).
 * - Inserts with the service role key (bypasses RLS).
 * - Silently swallows all errors — tracking must never break a pipeline.
 * - Skips anonymous users.
 */
export async function logStudioEvent(
  req: NextRequest,
  pipeline: StudioPipeline,
  action: string,
  metadata: Record<string, unknown> = {}
): Promise<void> {
  try {
    const supabaseAuth = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => req.cookies.getAll() } }
    );
    const { data: { user } } = await supabaseAuth.auth.getUser();
    if (!user || user.is_anonymous) return;

    const supabaseAdmin = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { cookies: { getAll: () => [], setAll: () => {} } }
    );
    await supabaseAdmin.from("usage_events").insert({
      user_id: user.id,
      pipeline,
      action,
      metadata,
    });
  } catch (err) {
    console.warn("[studio-tracking] Failed to log event:", err);
  }
}
