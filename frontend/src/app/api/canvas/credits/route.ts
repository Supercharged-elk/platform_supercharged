import { NextRequest, NextResponse } from "next/server";
import { getCanvasUser, getCreditsRow } from "@/lib/canvas-auth";

export async function GET(req: NextRequest) {
  const user = await getCanvasUser(req);
  if (!user) {
    return NextResponse.json({ generate_credits: 0, edit_credits: 0, animate_credits: 0 });
  }
  const credits = await getCreditsRow(user.userId);
  return NextResponse.json(credits);
}
