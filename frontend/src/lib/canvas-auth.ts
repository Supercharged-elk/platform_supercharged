/**
 * Server-side auth helper for Canvas API routes.
 * Verifies the Supabase JWT from the Authorization header.
 */
import { createClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export interface CanvasUser {
  userId: string;
  isAnonymous: boolean;
}

export async function getCanvasUser(req: NextRequest): Promise<CanvasUser | null> {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return null;

  const supabase = getServiceClient();
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return null;

  return { userId: user.id, isAnonymous: user.is_anonymous ?? false };
}

/** Get credits row for a user. Returns zeros if not found. */
export async function getCreditsRow(userId: string) {
  const supabase = getServiceClient();
  const res = await supabase
    .from("credits")
    .select("generate_credits, edit_credits, animate_credits")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  return res.data ?? { generate_credits: 0, edit_credits: 0, animate_credits: 0 };
}

/**
 * Atomically deduct one credit of the given type using the deduct_user_credit RPC.
 * Throws if insufficient credits or DB error.
 * Requires migration 012_atomic_credit_deduction.sql to be applied.
 */
export async function deductCredit(userId: string, type: "generate" | "edit" | "animate") {
  const supabase = getServiceClient();
  const col = `${type}_credits` as const;
  const { data: ok, error } = await supabase.rpc("deduct_user_credit", {
    p_user_id: userId,
    p_credit_type: col,
  });
  if (error || !ok) throw new Error(`Insufficient ${type} credits`);
}

/** Atomically refund one credit of the given type (call when generation fails after deduction). */
export async function refundCredit(userId: string, type: "generate" | "edit" | "animate") {
  try {
    const supabase = getServiceClient();
    const col = `${type}_credits` as const;
    await supabase.rpc("refund_user_credit", {
      p_user_id: userId,
      p_credit_type: col,
    });
  } catch {
    // best-effort — don't crash the error response if refund fails
  }
}

export { getServiceClient };
