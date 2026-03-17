import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

function isAllowedEmail(user: { email?: string; user_metadata?: { email?: string } } | null): boolean {
  if (!user) return false;
  const email = user.email ?? (user.user_metadata?.email as string | undefined) ?? "";
  return email.endsWith("@elkanodata.com");
}

export default async function CanvasLayout({ children }: { children: React.ReactNode }) {
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

  return <>{children}</>;
}
