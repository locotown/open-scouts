"use server";

import { supabaseServer } from "./supabase/server";

const FIRECRAWL_API_URL = "https://api.firecrawl.dev";

export type FirecrawlKeyStatus = "pending" | "active" | "fallback" | "failed" | "invalid";

export interface CreateFirecrawlKeyResult {
  success: boolean;
  apiKey?: string;
  alreadyExisted?: boolean;
  error?: string;
}

export interface FirecrawlKeyInfo {
  status: FirecrawlKeyStatus;
  hasKey: boolean;
  createdAt: string | null;
  error: string | null;
}

/**
 * Creates a Firecrawl API key for a user using the partner integration API.
 * This should be called when a user signs up.
 */
export async function createFirecrawlKeyForUser(
  userId: string,
  email: string
): Promise<CreateFirecrawlKeyResult> {
  const partnerKey = process.env.FIRECRAWL_API_KEY;

  if (!partnerKey) {
    console.error("[Firecrawl Partner] FIRECRAWL_API_KEY (partner key) not configured");
    return { success: false, error: "Partner key not configured" };
  }

  try {
    console.log(`[Firecrawl Partner] Creating API key for user: ${email}`);

    const response = await fetch(`${FIRECRAWL_API_URL}/admin/integration/create-user`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${partnerKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Firecrawl Partner] API error: ${response.status} - ${errorText}`);

      // Update user preferences with failed status
      await supabaseServer
        .from("user_preferences")
        .upsert({
          user_id: userId,
          firecrawl_key_status: "failed",
          firecrawl_key_error: `API error: ${response.status} - ${errorText}`,
        }, {
          onConflict: "user_id",
        });

      return {
        success: false,
        error: response.status === 401
          ? "Invalid partner key"
          : `Failed to create API key: ${response.status}`,
      };
    }

    const data = await response.json();
    const { apiKey, alreadyExisted } = data;

    console.log(`[Firecrawl Partner] API key created successfully (alreadyExisted: ${alreadyExisted})`);

    // Store the API key in user preferences
    await supabaseServer
      .from("user_preferences")
      .upsert({
        user_id: userId,
        firecrawl_api_key: apiKey,
        firecrawl_key_status: "active",
        firecrawl_key_created_at: new Date().toISOString(),
        firecrawl_key_error: null,
      }, {
        onConflict: "user_id",
      });

    return { success: true, apiKey, alreadyExisted };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`[Firecrawl Partner] Error creating API key: ${errorMessage}`);

    // Update user preferences with failed status
    await supabaseServer
      .from("user_preferences")
      .upsert({
        user_id: userId,
        firecrawl_key_status: "failed",
        firecrawl_key_error: errorMessage,
      }, {
        onConflict: "user_id",
      });

    return { success: false, error: errorMessage };
  }
}

/**
 * Validates a Firecrawl API key using the partner integration API.
 * Returns the associated team name and email if valid.
 */
export async function validateFirecrawlKey(
  apiKey: string
): Promise<{ valid: boolean; teamName?: string; email?: string; error?: string }> {
  const partnerKey = process.env.FIRECRAWL_API_KEY;

  if (!partnerKey) {
    return { valid: false, error: "Partner key not configured" };
  }

  try {
    const response = await fetch(`${FIRECRAWL_API_URL}/admin/integration/validate-api-key`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${partnerKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ apiKey }),
    });

    if (response.status === 404) {
      return { valid: false, error: "API key not found or was deleted" };
    }

    if (!response.ok) {
      return { valid: false, error: `Validation failed: ${response.status}` };
    }

    const data = await response.json();
    return { valid: true, teamName: data.teamName, email: data.email };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Gets the Firecrawl API key for a user, or marks them for fallback.
 * This is used by edge functions to get the appropriate key.
 */
export async function getFirecrawlKeyForUser(
  userId: string
): Promise<{ apiKey: string | null; status: FirecrawlKeyStatus; useFallback: boolean }> {
  try {
    const { data, error } = await supabaseServer
      .from("user_preferences")
      .select("firecrawl_api_key, firecrawl_key_status")
      .eq("user_id", userId)
      .single();

    if (error || !data) {
      return { apiKey: null, status: "pending", useFallback: true };
    }

    const { firecrawl_api_key, firecrawl_key_status } = data;

    // If key exists and is active, use it
    if (firecrawl_api_key && firecrawl_key_status === "active") {
      return { apiKey: firecrawl_api_key, status: "active", useFallback: false };
    }

    // Otherwise, use fallback
    return {
      apiKey: null,
      status: firecrawl_key_status || "pending",
      useFallback: true,
    };
  } catch {
    return { apiKey: null, status: "failed", useFallback: true };
  }
}

/**
 * Marks a user's Firecrawl key as invalid (e.g., after a 401 error).
 * This triggers the fallback mechanism.
 */
export async function markFirecrawlKeyInvalid(
  userId: string,
  reason: string
): Promise<void> {
  await supabaseServer
    .from("user_preferences")
    .update({
      firecrawl_key_status: "invalid",
      firecrawl_key_error: reason,
    })
    .eq("user_id", userId);
}

/**
 * Logs Firecrawl usage for monitoring and debugging.
 */
export async function logFirecrawlUsage(params: {
  userId: string;
  scoutId?: string;
  executionId?: string;
  usedFallback: boolean;
  fallbackReason?: string;
  apiCallsCount?: number;
}): Promise<void> {
  try {
    await supabaseServer
      .from("firecrawl_usage_logs")
      .insert({
        user_id: params.userId,
        scout_id: params.scoutId || null,
        execution_id: params.executionId || null,
        used_fallback: params.usedFallback,
        fallback_reason: params.fallbackReason || null,
        api_calls_count: params.apiCallsCount || 1,
      });
  } catch (error) {
    // Don't fail the main operation if logging fails
    console.error("[Firecrawl Partner] Failed to log usage:", error);
  }
}

/**
 * Gets the Firecrawl key status for display in the settings page.
 */
export async function getFirecrawlKeyInfo(userId: string): Promise<FirecrawlKeyInfo> {
  try {
    const { data, error } = await supabaseServer
      .from("user_preferences")
      .select("firecrawl_api_key, firecrawl_key_status, firecrawl_key_created_at, firecrawl_key_error")
      .eq("user_id", userId)
      .single();

    if (error || !data) {
      return {
        status: "pending",
        hasKey: false,
        createdAt: null,
        error: null,
      };
    }

    return {
      status: data.firecrawl_key_status || "pending",
      hasKey: !!data.firecrawl_api_key,
      createdAt: data.firecrawl_key_created_at,
      error: data.firecrawl_key_error,
    };
  } catch {
    return {
      status: "failed",
      hasKey: false,
      createdAt: null,
      error: "Failed to fetch status",
    };
  }
}

/**
 * Regenerates a Firecrawl API key for a user.
 * This can be called if the user's key was invalidated.
 */
export async function regenerateFirecrawlKey(
  userId: string,
  email: string
): Promise<CreateFirecrawlKeyResult> {
  console.log(`[Firecrawl Partner] Regenerating API key for user: ${email}`);

  // Simply call create again - the partner API handles existing users
  return createFirecrawlKeyForUser(userId, email);
}
