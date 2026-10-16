-- Keep existing accounts and entries. ChatGPT identities are never linked by email.
CREATE TABLE openai_identities (
  identity_key TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  display_email TEXT NOT NULL
);
CREATE TABLE openai_login_challenges (
  id TEXT PRIMARY KEY,
  nonce TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
DELETE FROM analysis_jobs;
UPDATE users SET ai_provider = 'chatgpt', entries_version = entries_version + 1,
  magic_token = NULL, magic_token_expires_at = NULL;
