CREATE TABLE auth_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
CREATE INDEX idx_auth_sessions_user ON auth_sessions(user_id);
CREATE INDEX idx_auth_sessions_expiry ON auth_sessions(expires_at);
CREATE TABLE encrypted_vaults (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  envelope TEXT,
  write_id TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
-- Keep each ciphertext chunk below D1's 2 MB row/string limit.
CREATE TABLE encrypted_vault_chunks (
  user_id TEXT NOT NULL REFERENCES encrypted_vaults(user_id) ON DELETE CASCADE,
  part INTEGER NOT NULL,
  ciphertext TEXT NOT NULL,
  PRIMARY KEY (user_id, part)
);
ALTER TABLE users ADD COLUMN privacy_migration TEXT;
-- Keep legacy journals until their owner verifies an encrypted local copy.
-- Stop retaining display email and old raw-IP login buckets.
UPDATE openai_identities SET display_email = 'ChatGPT account';
DELETE FROM rate_limits;
DELETE FROM openai_login_challenges;
DELETE FROM analysis_jobs;
