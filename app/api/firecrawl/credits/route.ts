import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { supabaseServer } from "@/lib/supabase/server";

const FIRECRAWL_API_URL = "https://api.firecrawl.dev/v1";

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();

    // Get the authenticated user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get the user's Firecrawl API key from preferences
    const { data: preferences, error: prefError } = await supabaseServer
      .from("user_preferences")
      .select("firecrawl_api_key, firecrawl_key_status")
      .eq("user_id", user.id)
      .single();

    if (prefError || !preferences?.firecrawl_api_key) {
      return NextResponse.json({
        success: true,
        data: {
          remainingCredits: null,
          planCredits: null,
          status: preferences?.firecrawl_key_status || "pending",
        },
      });
    }

    // Fetch credit usage from Firecrawl API
    const response = await fetch(`${FIRECRAWL_API_URL}/team/credit-usage`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${preferences.firecrawl_api_key}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        `[Firecrawl Credits] API error: ${response.status} - ${errorText}`,
      );

      // If 401/403, the key might be invalid
      if (response.status === 401 || response.status === 403) {
        return NextResponse.json({
          success: true,
          data: {
            remainingCredits: null,
            planCredits: null,
            status: "invalid",
            error: "API key is invalid",
          },
        });
      }

      return NextResponse.json(
        { error: `Failed to fetch credits: ${response.status}` },
        { status: 500 },
      );
    }

    const data = await response.json();

    return NextResponse.json({
      success: true,
      data: {
        remainingCredits: data.data?.remaining_credits ?? null,
        planCredits: data.data?.plan_credits ?? null,
        billingPeriodStart: data.data?.billing_period_start ?? null,
        billingPeriodEnd: data.data?.billing_period_end ?? null,
        status: preferences.firecrawl_key_status,
      },
    });
  } catch (error) {
    console.error("[Firecrawl Credits] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
