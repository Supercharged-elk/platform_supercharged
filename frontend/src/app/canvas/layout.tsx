import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import Link from "next/link";
import { Lock, ArrowLeft } from "lucide-react";

function getDevEmails(): string[] {
  return (process.env.CANVAS_DEV_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

function isDevEmail(user: { email?: string; user_metadata?: { email?: string } } | null): boolean {
  if (!user) return false;
  const email = (user.email ?? (user.user_metadata?.email as string | undefined) ?? "").toLowerCase();
  return getDevEmails().includes(email);
}

function CanvasComingSoon() {
  return (
    <div className="min-h-screen bg-neutral-950 flex flex-col items-center justify-center px-6">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-neutral-900 border border-neutral-800 mx-auto">
          <Lock size={28} className="text-neutral-500" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">Canvas</h1>
          <p className="text-neutral-500 mt-2 text-sm leading-relaxed">
            The visual pipeline builder is currently in development and not available in this beta.
            <br className="hidden sm:block" />
            Stay tuned — it's coming soon.
          </p>
        </div>
        <Link
          href="/studio"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-sm font-medium transition"
        >
          <ArrowLeft size={14} />
          Back to Studio
        </Link>
      </div>
    </div>
  );
}

export default async function CanvasLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = cookies();

  // Allow E2E tests to bypass the dev-email gate in non-production environments
  const isE2EBypass =
    process.env.NODE_ENV !== "production" &&
    cookieStore.get("e2e_auth_bypass")?.value === "1";

  if (isE2EBypass) {
    return <>{children}</>;
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } }
  );
  const { data: { user } } = await supabase.auth.getUser();

  if (!isDevEmail(user)) {
    return <CanvasComingSoon />;
  }

  return <>{children}</>;
}
