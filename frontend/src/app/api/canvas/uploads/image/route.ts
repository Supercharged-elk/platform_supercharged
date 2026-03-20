import { NextRequest, NextResponse } from "next/server";
import { getCanvasUser, getServiceClient } from "@/lib/canvas-auth";

/** POST /api/canvas/uploads/image — upload an image to Supabase Storage */
export async function POST(req: NextRequest) {
  const user = await getCanvasUser(req);
  if (!user) return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ detail: "No file provided" }, { status: 422 });

  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);
  const ext = file.name.split(".").pop() ?? "jpg";
  const path = `uploads/${user.userId}/${Date.now()}.${ext}`;

  const supabase = getServiceClient();
  const { error } = await supabase.storage
    .from("ai-assets")
    .upload(path, buffer, { contentType: file.type || "image/jpeg", upsert: false });

  if (error) return NextResponse.json({ detail: error.message }, { status: 500 });

  const { data: urlData } = supabase.storage.from("ai-assets").getPublicUrl(path);
  return NextResponse.json({ url: urlData.publicUrl });
}
