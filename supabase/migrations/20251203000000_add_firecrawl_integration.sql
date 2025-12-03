-- =============================================================================
-- FIRECRAWL PARTNER INTEGRATION
-- Adds per-user Firecrawl API keys with status tracking
-- =============================================================================

-- Add firecrawl columns to user_preferences table
ALTER TABLE user_preferences
ADD COLUMN IF NOT EXISTS firecrawl_api_key TEXT,
ADD COLUMN IF NOT EXISTS firecrawl_key_status TEXT DEFAULT 'pending'
  CHECK (firecrawl_key_status IN ('pending', 'active', 'fallback', 'failed', 'invalid')),
ADD COLUMN IF NOT EXISTS firecrawl_key_created_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS firecrawl_key_error TEXT;

-- Add comment explaining the statuses
COMMENT ON COLUMN user_preferences.firecrawl_key_status IS
'Status of the Firecrawl API key:
- pending: Key has not been created yet
- active: Key is valid and in use
- fallback: Using shared partner key (user key unavailable)
- failed: Key creation failed
- invalid: Key was invalidated (deleted by user or expired)';

COMMENT ON COLUMN user_preferences.firecrawl_key_error IS
'Error message if key creation or validation failed';

-- Create index for faster lookups by user_id (if not exists)
CREATE INDEX IF NOT EXISTS idx_user_preferences_firecrawl_status
ON user_preferences(firecrawl_key_status)
WHERE firecrawl_key_status IS NOT NULL;

-- =============================================================================
-- FIRECRAWL USAGE TRACKING TABLE
-- Tracks when fallback is used for monitoring purposes
-- =============================================================================
CREATE TABLE IF NOT EXISTS firecrawl_usage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  scout_id UUID REFERENCES scouts(id) ON DELETE SET NULL,
  execution_id UUID REFERENCES scout_executions(id) ON DELETE SET NULL,
  used_fallback BOOLEAN NOT NULL DEFAULT false,
  fallback_reason TEXT,
  api_calls_count INTEGER DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for querying usage by user
CREATE INDEX IF NOT EXISTS idx_firecrawl_usage_user_id ON firecrawl_usage_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_firecrawl_usage_created_at ON firecrawl_usage_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_firecrawl_usage_fallback ON firecrawl_usage_logs(used_fallback) WHERE used_fallback = true;

-- Enable RLS on the new table
ALTER TABLE firecrawl_usage_logs ENABLE ROW LEVEL SECURITY;

-- RLS policies for firecrawl_usage_logs
CREATE POLICY "Users can view their own usage logs"
  ON firecrawl_usage_logs FOR SELECT
  USING (auth.uid() = user_id);

-- Service role can insert logs (from edge functions)
-- Note: Service role bypasses RLS by default
