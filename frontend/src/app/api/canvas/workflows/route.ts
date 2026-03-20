import { NextRequest, NextResponse } from "next/server";
import { getCanvasUser, getServiceClient } from "@/lib/canvas-auth";

/** GET /api/canvas/workflows — list user's workflows */
export async function GET(req: NextRequest) {
  const user = await getCanvasUser(req);
  if (!user) return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });

  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("workflows")
    .select("id, name, is_public, created_at, updated_at")
    .eq("user_id", user.userId)
    .order("updated_at", { ascending: false });

  if (error) return NextResponse.json({ detail: error.message }, { status: 500 });
  return NextResponse.json({ workflows: data ?? [] });
}

/** POST /api/canvas/workflows — create a workflow */
export async function POST(req: NextRequest) {
  const user = await getCanvasUser(req);
  if (!user) return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { name, graph_json, project_id, is_public } = body;

  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("workflows")
    .insert({ user_id: user.userId, name, graph_json, project_id: project_id ?? null, is_public: is_public ?? false })
    .select()
    .single();

  if (error) return NextResponse.json({ detail: error.message }, { status: 500 });
  return NextResponse.json(data);
}
