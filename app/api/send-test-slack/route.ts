import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

// Rate limit: 1 minute between test Slack notifications
const TEST_SLACK_COOLDOWN_SECONDS = 60;
const TEST_SLACK_COOLDOWN_MS = TEST_SLACK_COOLDOWN_SECONDS * 1000;

// Slack webhook URL pattern: https://hooks.slack.com/services/T.../B.../...
const SLACK_WEBHOOK_PATTERN =
  /^https:\/\/hooks\.slack\.com\/services\/T[A-Z0-9]+\/B[A-Z0-9]+\/[A-Za-z0-9]+$/;

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();

    // Verify user is authenticated
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await request.json();
    const { webhookUrl: providedWebhookUrl } = body;

    // Get webhook URL from preferences if not provided
    const { data: preferences } = await supabase
      .from("user_preferences")
      .select("slack_webhook_url, last_test_slack_at")
      .eq("user_id", user.id)
      .maybeSingle();

    const webhookUrl = providedWebhookUrl || preferences?.slack_webhook_url;

    if (!webhookUrl) {
      return NextResponse.json(
        { error: "No Slack webhook URL configured" },
        { status: 400 },
      );
    }

    // Validate webhook URL format with regex
    if (!SLACK_WEBHOOK_PATTERN.test(webhookUrl)) {
      return NextResponse.json(
        {
          error:
            "Invalid webhook URL format. Must be a valid Slack webhook URL (https://hooks.slack.com/services/T.../B.../...)",
        },
        { status: 400 },
      );
    }

    // Rate limit check
    if (preferences?.last_test_slack_at) {
      const lastSentAt = new Date(preferences.last_test_slack_at).getTime();
      const elapsed = Date.now() - lastSentAt;
      if (elapsed < TEST_SLACK_COOLDOWN_MS) {
        const remainingSeconds = Math.ceil(
          (TEST_SLACK_COOLDOWN_MS - elapsed) / 1000,
        );
        return NextResponse.json(
          {
            error: `Please wait ${remainingSeconds} seconds before sending another test`,
            cooldownRemaining: Math.max(1, remainingSeconds),
          },
          { status: 429 },
        );
      }
    }

    // Send test notification to Slack
    const payload = {
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

    const slackResponse = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!slackResponse.ok) {
      const errorText = await slackResponse.text();
      return NextResponse.json(
        { error: `Slack returned error: ${errorText}` },
        { status: 400 },
      );
    }

    // Update or create preferences with timestamp
    const now = new Date().toISOString();
    if (preferences) {
      await supabase
        .from("user_preferences")
        .update({ last_test_slack_at: now })
        .eq("user_id", user.id);
    } else {
      await supabase.from("user_preferences").insert({
        user_id: user.id,
        slack_webhook_url: webhookUrl,
        last_test_slack_at: now,
      });
    }

    return NextResponse.json({
      success: true,
      message: "Test notification sent successfully",
    });
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : "Internal server error";
    console.error("[send-test-slack] Error:", error);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
