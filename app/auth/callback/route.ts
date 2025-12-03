import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { supabaseServer } from "@/lib/supabase/server";
import { createFirecrawlKeyForUser } from "@/lib/firecrawl-partner";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const redirectTo = searchParams.get("redirectTo") || "/";
  const pendingQuery = searchParams.get("pendingQuery") || "";

  if (code) {
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      // Get the authenticated user
      const { data: { user } } = await supabase.auth.getUser();

      if (user?.id && user?.email) {
        // Check if user already has a Firecrawl API key
        const { data: preferences } = await supabaseServer
          .from("user_preferences")
          .select("firecrawl_api_key, firecrawl_key_status")
          .eq("user_id", user.id)
          .single();

        // Create Firecrawl API key if not already active
        const needsKey = !preferences?.firecrawl_api_key ||
          preferences?.firecrawl_key_status !== "active";

        if (needsKey) {
          // Create the key asynchronously - don't block the redirect
          // The key creation is idempotent, so it's safe to call multiple times
          createFirecrawlKeyForUser(user.id, user.email).catch((err) => {
            console.error("[Auth Callback] Failed to create Firecrawl key:", err);
          });
        }
      }

      // If there's a pending query, redirect to home to process it
      if (pendingQuery) {
        return NextResponse.redirect(
          `${origin}/?pendingQuery=${encodeURIComponent(pendingQuery)}`
        );
      }
      return NextResponse.redirect(`${origin}${redirectTo}`);
    }
  }

  // Return the user to an error page with instructions
  return NextResponse.redirect(`${origin}/login?error=auth_callback_error`);
}
