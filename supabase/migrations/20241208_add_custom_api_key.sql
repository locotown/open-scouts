-- Add custom API key column to user_preferences
ALTER TABLE user_preferences 
ADD COLUMN IF NOT EXISTS firecrawl_custom_api_key TEXT;

COMMENT ON COLUMN user_preferences.firecrawl_custom_api_key IS 
'User''s own Firecrawl API key. Takes priority over the auto-generated sponsored key.';
