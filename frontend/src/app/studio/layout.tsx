import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { StudioNavLinks } from "./StudioNavLinks";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Studio — Canvas Platform",
};

function isAllowedEmail(user: { email?: string; user_metadata?: { email?: string } } | null): boolean {
  if (!user) return false;
  const email = user.email ?? (user.user_metadata?.email as string | undefined) ?? "";
  return email.endsWith("@elkanodata.com");
}

export default async function StudioLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } }
  );
  const { data: { user } } = await supabase.auth.getUser();

  if (!isAllowedEmail(user)) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen bg-neutral-950">
      {/* Global studio nav */}
      <nav className="fixed top-0 left-0 right-0 z-50 h-12 bg-neutral-950 border-b border-neutral-800 flex items-center px-4 gap-4">
        <Link
          href="/canvas"
          className="flex items-center gap-1.5 text-xs text-neutral-500 hover:text-neutral-300 transition"
        >
          <ArrowLeft size={12} />
          Canvas
        </Link>

        <span className="text-neutral-700">|</span>
        <span className="text-xs font-semibold text-white">Studio</span>

        <StudioNavLinks />
      </nav>

      <div className="pt-12">{children}</div>
    </div>
  );
}
