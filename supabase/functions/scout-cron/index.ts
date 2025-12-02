// Main HTTP handler for scout-cron edge function : npx supabase functions deploy scout-cron

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

import type { Scout } from "./types.ts";
import { corsHeaders } from "./constants.ts";
import { shouldRunScout } from "./helpers.ts";
import { executeScoutAgent } from "./agent.ts";

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Supabase configuration missing");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Clean up stuck executions (running for more than 3 minutes)
    console.log("Checking for stuck executions...");
    const threeMinutesAgo = new Date(Date.now() - 3 * 60 * 1000).toISOString();

    const { data: stuckExecutions } = await supabase
      .from("scout_executions")
      .select("id, scout_id, started_at")
      .eq("status", "running")
      .lt("started_at", threeMinutesAgo);

    if (stuckExecutions && stuckExecutions.length > 0) {
      console.log(`Found ${stuckExecutions.length} stuck execution(s), marking as failed...`);

      for (const execution of stuckExecutions) {
        await supabase
          .from("scout_executions")
          .update({
            status: "failed",
            completed_at: new Date().toISOString(),
            error_message: "Execution timed out after 3 minutes (Supabase Edge Function limit)",
          })
          .eq("id", execution.id);

        console.log(`Marked execution ${execution.id} as failed (stuck since ${execution.started_at})`);
      }
    } else {
      console.log("No stuck executions found");
    }

    // Disable scouts for users who haven't logged in for 30+ days
    console.log("Checking for inactive users (30+ days since last login)...");
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    // Get unique user_ids that have active scouts
    const { data: activeScoutUsers, error: scoutUsersError } = await supabase
      .from("scouts")
      .select("user_id")
      .eq("is_active", true);

    if (scoutUsersError) {
      console.error("Error fetching scout users:", scoutUsersError.message);
    } else if (activeScoutUsers && activeScoutUsers.length > 0) {
      // Get unique user IDs
      const uniqueUserIds = [...new Set(activeScoutUsers.map((s: { user_id: string }) => s.user_id))];
      const inactiveUserIds: string[] = [];

      // Check each user's last sign in via admin API
      for (const userId of uniqueUserIds) {
        try {
          const { data: { user }, error: userError } = await supabase.auth.admin.getUserById(userId);
          if (userError) {
            console.error(`Error fetching user ${userId}:`, userError.message);
            continue;
          }
          if (user?.last_sign_in_at) {
            const lastSignIn = new Date(user.last_sign_in_at);
            if (lastSignIn < thirtyDaysAgo) {
              inactiveUserIds.push(userId);
            }
          }
        } catch (err) {
          console.error(`Error checking user ${userId}:`, err);
        }
      }

      if (inactiveUserIds.length > 0) {
        console.log(`Found ${inactiveUserIds.length} inactive user(s), disabling their scouts...`);

        const { data: disabledScouts, error: disableError } = await supabase
          .from("scouts")
          .update({ is_active: false })
          .in("user_id", inactiveUserIds)
          .eq("is_active", true)
          .select("id");

        if (disableError) {
          console.error("Error disabling scouts for inactive users:", disableError.message);
        } else {
          console.log(`Disabled ${disabledScouts?.length || 0} scout(s) for inactive users`);
        }
      } else {
        console.log("No inactive users found among active scout owners");
      }
    } else {
      console.log("No active scouts to check");
    }

    // Check if a specific scoutId was provided in query params
    const url = new URL(req.url);
    const scoutId = url.searchParams.get("scoutId");

    let scoutsToRun: Scout[];

    if (scoutId) {
      // Manual trigger for specific scout - run it regardless of schedule
      console.log(`Manual trigger for scout: ${scoutId}`);

      // First check if scout exists at all
      const { data: scoutCheck, error: checkError } = await supabase
        .from("scouts")
        .select("*")
        .eq("id", scoutId)
        .single();

      if (checkError || !scoutCheck) {
        throw new Error(`Scout ${scoutId} not found in database`);
      }

      if (!scoutCheck.is_active) {
        throw new Error(`Scout ${scoutId} is not active. Please activate it in the settings.`);
      }

      const scout = scoutCheck;

      // Check if scout configuration is complete
      const isComplete =
        scout.title &&
        scout.goal &&
        scout.description &&
        scout.location &&
        scout.search_queries?.length > 0 &&
        scout.frequency;

      if (!isComplete) {
        throw new Error(`Scout ${scoutId} configuration is not complete`);
      }

      scoutsToRun = [scout as Scout];
    } else {
      // Cron trigger - run all scouts that are due
      const { data: scouts, error } = await supabase
        .from("scouts")
        .select("*")
        .eq("is_active", true);

      if (error) {
        throw error;
      }

      scoutsToRun = (scouts as Scout[]).filter(shouldRunScout);
    }

    console.log(`Found ${scoutsToRun.length} scouts to run`);

    // Execute each scout (in parallel for efficiency)
    await Promise.all(
      scoutsToRun.map((scout) => executeScoutAgent(scout, supabase))
    );

    return new Response(
      JSON.stringify({
        success: true,
        scoutsExecuted: scoutsToRun.length,
        scouts: scoutsToRun.map((s) => ({ id: s.id, title: s.title })),
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error: any) {
    console.error("Error in scout-cron:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
