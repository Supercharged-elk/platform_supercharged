import { NextRequest, NextResponse } from "next/server";
import { getCanvasUser, getServiceClient } from "@/lib/canvas-auth";

/** GET /api/canvas/projects */
export async function GET(req: NextRequest) {
  const user = await getCanvasUser(req);
  if (!user) return NextResponse.json({ projects: [] });

  const supabase = getServiceClient();
  const { data } = await supabase
    .from("projects")
    .select("id, name, active, created_at")
    .eq("created_by", user.userId)
    .eq("active", true)
    .order("created_at", { ascending: false });

  return NextResponse.json({ projects: data ?? [] });
}

/** POST /api/canvas/projects */
export async function POST(req: NextRequest) {
  const user = await getCanvasUser(req);
  if (!user) return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });

  const { name } = await req.json();
  if (!name?.trim()) return NextResponse.json({ detail: "Project name required" }, { status: 422 });

  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("projects")
    .insert({ name: name.trim(), created_by: user.userId, active: true })
    .select()
    .single();

  if (error) return NextResponse.json({ detail: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
