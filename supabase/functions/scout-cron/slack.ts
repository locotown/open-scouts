// Slack notification helper for successful scouts

import type { ScoutResponse, Scout } from "./types.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

// Slack webhook URL pattern: https://hooks.slack.com/services/T.../B.../...
const SLACK_WEBHOOK_PATTERN =
  /^https:\/\/hooks\.slack\.com\/services\/T[A-Z0-9]+\/B[A-Z0-9]+\/[A-Za-z0-9]+$/;

interface SlackBlock {
  type: string;
  text?: {
    type: string;
    text: string;
    emoji?: boolean;
  };
  elements?: Array<{
    type: string;
    text?: string | { type: string; text: string; emoji?: boolean };
    url?: string;
    action_id?: string;
  }>;
  accessory?: {
    type: string;
    text: { type: string; text: string; emoji?: boolean };
    url: string;
    action_id: string;
  };
}

interface SlackPayload {
  text: string;
  blocks: SlackBlock[];
}

/**
 * Sends a Slack notification when a scout finds results
 * Uses the user's configured Slack Incoming Webhook URL
 */
export async function sendSlackNotification(
  scout: Scout,
  scoutResponse: ScoutResponse,
  supabase: SupabaseClient
): Promise<void> {
  try {
    // Fetch user's Slack webhook URL from user_preferences
    const { data: preferences, error: prefError } = await supabase
      .from("user_preferences")
      .select("slack_webhook_url")
      .eq("user_id", scout.user_id)
      .single();

    if (prefError || !preferences?.slack_webhook_url) {
      console.log("[Slack] No webhook URL configured, skipping Slack notification");
      return;
    }

    const webhookUrl = preferences.slack_webhook_url;

    // Validate webhook URL format with regex
    if (!SLACK_WEBHOOK_PATTERN.test(webhookUrl)) {
      console.log("[Slack] Invalid webhook URL format, skipping");
      return;
    }

    console.log(`[Slack] Sending notification for scout: ${scout.title}`);

    // Format the Slack message
    const payload = formatSlackMessage(scout, scoutResponse);

    // Send to Slack webhook
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Slack] Failed to send notification: ${response.status} - ${errorText}`);
      return;
    }

    console.log("[Slack] Notification sent successfully!");
  } catch (error: unknown) {
    // Don't throw - we don't want Slack failures to break scout execution
    const message = error instanceof Error ? error.message : String(error);
    console.error("[Slack] Error sending notification:", message);
  }
}

/**
 * Escapes special characters for Slack mrkdwn format
 * Prevents user content from breaking message formatting
 */
function escapeSlackText(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Formats the scout results into a Slack Block Kit message
 */
function formatSlackMessage(scout: Scout, scoutResponse: ScoutResponse): SlackPayload {
  // Clean up the response - remove markdown formatting for Slack
  let cleanResponse = scoutResponse.response
    .replace(/## /g, "*")
    .replace(/\*\*(.*?)\*\*/g, "*$1*")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "<$2|$1>");

  // Slack limits: text block max 3000 chars, keep safe margin at 2000
  const MAX_TEXT_LENGTH = 2000;
  if (cleanResponse.length > MAX_TEXT_LENGTH) {
    cleanResponse = cleanResponse.substring(0, MAX_TEXT_LENGTH - 15) + "\n\n...(truncated)";
  }

  // Escape user-provided content to prevent formatting issues
  const safeTitle = escapeSlackText(scout.title);
  const safeGoal = escapeSlackText(scout.goal);

  const blocks: SlackBlock[] = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: `🔍 Scout Alert: ${safeTitle}`,
        emoji: true,
      },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `Your scout *${safeTitle}* found new results!`,
      },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Goal:* ${safeGoal}`,
      },
    },
    {
      type: "divider" as const,
    } as SlackBlock,
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: cleanResponse,
      },
    },
    {
      type: "divider" as const,
    } as SlackBlock,
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `📍 ${escapeSlackText(scout.location?.city || "No location")} | ⏰ ${new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}`,
        },
      ],
    },
  ];

  return {
    text: `Scout Alert: ${safeTitle} found new results!`,
    blocks,
  };
}

/**
 * Sends a test Slack notification to verify webhook configuration
 */
export async function sendTestSlackNotification(webhookUrl: string): Promise<{ success: boolean; error?: string }> {
  try {
    // Validate webhook URL format with regex
    if (!SLACK_WEBHOOK_PATTERN.test(webhookUrl)) {
      return { success: false, error: "Invalid webhook URL format. Must be a valid Slack webhook URL (https://hooks.slack.com/services/T.../B.../...)" };
    }

    const payload: SlackPayload = {
      text: "Test notification from Open Scouts",
      blocks: [
        {
          type: "header",
          text: {
            type: "plain_text",
            text: "🎉 Open Scouts Test Notification",
            emoji: true,
          },
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: "Great news! Your Slack notifications are configured correctly.\n\nWhen your scouts find results, you'll receive notifications here.",
          },
        },
        {
          type: "context",
          elements: [
            {
              type: "mrkdwn",
              text: `Sent at ${new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}`,
            },
          ],
        },
      ],
    };

    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return { success: false, error: `Slack returned error: ${errorText}` };
    }

    return { success: true };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: message };
  }
}
