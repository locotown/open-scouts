import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { regenerateFirecrawlKey } from "@/lib/firecrawl-partner";

export async function POST() {
  try {
    const supabase = await createServerSupabaseClient();

    // Get the authenticated user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    if (!user.email) {
      return NextResponse.json(
        { error: "User email not found" },
        { status: 400 }
      );
    }

    // Regenerate the Firecrawl API key
    const result = await regenerateFirecrawlKey(user.id, user.email);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || "Failed to regenerate API key" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      alreadyExisted: result.alreadyExisted,
    });
  } catch (error) {
    console.error("[API] Error regenerating Firecrawl key:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
