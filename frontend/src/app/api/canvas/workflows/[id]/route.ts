import { NextRequest, NextResponse } from "next/server";
import { getCanvasUser, getServiceClient } from "@/lib/canvas-auth";

/** GET /api/canvas/workflows/[id] */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCanvasUser(req);
  const { id } = await params;
  const supabase = getServiceClient();

  const { data: wf, error } = await supabase
    .from("workflows")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error || !wf) return NextResponse.json({ detail: "Workflow not found" }, { status: 404 });

  if (!wf.is_public && wf.user_id !== user?.userId) {
    return NextResponse.json({ detail: "Access denied" }, { status: 403 });
  }

  return NextResponse.json(wf);
}

/** PATCH /api/canvas/workflows/[id] */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCanvasUser(req);
  if (!user) return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const { name, graph_json, is_public, project_id } = body;

  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("workflows")
    .update({ name, graph_json, is_public: is_public ?? false, project_id: project_id ?? null })
    .eq("id", id)
    .eq("user_id", user.userId)
    .select()
    .maybeSingle();

  if (error) return NextResponse.json({ detail: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ detail: "Workflow not found or access denied" }, { status: 404 });
  return NextResponse.json(data);
}

/** DELETE /api/canvas/workflows/[id] */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCanvasUser(req);
  if (!user) return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const supabase = getServiceClient();

  const { error } = await supabase
    .from("workflows")
    .delete()
    .eq("id", id)
    .eq("user_id", user.userId);

  if (error) return NextResponse.json({ detail: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
