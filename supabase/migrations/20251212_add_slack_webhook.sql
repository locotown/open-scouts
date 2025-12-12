-- Add Slack webhook URL to user_preferences for Slack notifications
ALTER TABLE user_preferences
ADD COLUMN IF NOT EXISTS slack_webhook_url TEXT;

-- Add timestamp for Slack test rate limiting
ALTER TABLE user_preferences
ADD COLUMN IF NOT EXISTS last_test_slack_at TIMESTAMP WITH TIME ZONE;

COMMENT ON COLUMN user_preferences.slack_webhook_url IS
'Slack Incoming Webhook URL for sending scout notifications to Slack';
