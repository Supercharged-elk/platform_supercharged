import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  const payload = await req.json();
  const user = payload.record;

  if (!user?.id) {
    return new Response("no user", { status: 400 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // Crear perfil de usuario
  const { error: profileError } = await supabase
    .from("user_profiles")
    .upsert({
      user_id: user.id,
      display_name: user.raw_user_meta_data?.full_name || user.email || "Anonymous",
      avatar_url: user.raw_user_meta_data?.avatar_url || null,
      role: "member",
    });

  if (profileError) {
    console.error("Error creating profile:", profileError);
    return new Response(JSON.stringify({ error: profileError.message }), { status: 500 });
  }

  // Sembrar créditos iniciales
  const { error: creditsError } = await supabase
    .from("credits")
    .upsert({
      user_id: user.id,
      generate_credits: 10,
      edit_credits: 5,
      animate_credits: 2,
    });

  if (creditsError) {
    console.error("Error seeding credits:", creditsError);
    return new Response(JSON.stringify({ error: creditsError.message }), { status: 500 });
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200 });
});
