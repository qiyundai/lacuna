CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  email TEXT UNIQUE,
  magic_token TEXT,
  magic_token_expires_at INTEGER,
  recovery_code_hash TEXT,
  created_at INTEGER DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS email_otps (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS entries (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at INTEGER DEFAULT (unixepoch()),
  solidified_at INTEGER
);

CREATE TABLE IF NOT EXISTS patterns (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id TEXT UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  model_weights TEXT NOT NULL DEFAULT '{}',
  entry_count_at_last_memoir INTEGER NOT NULL DEFAULT 0,
  last_updated INTEGER DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS memoir_snapshots (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  prose TEXT NOT NULL,
  generated_at INTEGER DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS passkey_credentials (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  public_key TEXT NOT NULL,
  sign_count INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS passkey_challenges (
  challenge TEXT PRIMARY KEY,
  user_id TEXT,
  type TEXT NOT NULL CHECK(type IN ('registration','authentication')),
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_entries_user_created ON entries(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_memoir_user_generated ON memoir_snapshots(user_id, generated_at DESC);
CREATE INDEX IF NOT EXISTS idx_passkey_creds_user ON passkey_credentials(user_id);
