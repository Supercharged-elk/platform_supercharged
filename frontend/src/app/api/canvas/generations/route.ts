import { NextRequest, NextResponse } from "next/server";
import { getCanvasUser, getServiceClient } from "@/lib/canvas-auth";

/** GET /api/canvas/generations?page=0&limit=20 */
export async function GET(req: NextRequest) {
  const user = await getCanvasUser(req);
  if (!user) return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const page = parseInt(searchParams.get("page") ?? "0", 10);
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "20", 10), 100);
  const from = page * limit;
  const to = from + limit - 1;

  const supabase = getServiceClient();
  const { data, error, count } = await supabase
    .from("generations")
    .select("id, mode, model_used, image_url, video_url, user_prompt, created_at", { count: "exact" })
    .eq("user_id", user.userId)
    .order("created_at", { ascending: false })
    .range(from, to);

  if (error) return NextResponse.json({ detail: error.message }, { status: 500 });
  return NextResponse.json({ generations: data ?? [], total: count ?? 0, page, limit });
}
