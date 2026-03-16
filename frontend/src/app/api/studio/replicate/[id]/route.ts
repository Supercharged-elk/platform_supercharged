import { NextRequest, NextResponse } from "next/server";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) {
    return NextResponse.json({ error: "REPLICATE_API_TOKEN not configured" }, { status: 500 });
  }

  const { id } = params;

  const res = await fetch(`https://api.replicate.com/v1/predictions/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });

  if (!res.ok) {
    const err = await res.text();
    return NextResponse.json({ error: `Replicate poll error: ${err}` }, { status: res.status });
  }

  const data = await res.json();
  return NextResponse.json(data);
}
