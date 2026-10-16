ALTER TABLE users ADD COLUMN ai_provider TEXT NOT NULL DEFAULT 'anthropic';
ALTER TABLE users ADD COLUMN entries_version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN analyzed_version INTEGER NOT NULL DEFAULT -1;

CREATE TRIGGER entries_insert_version AFTER INSERT ON entries BEGIN
  UPDATE users SET entries_version = entries_version + 1 WHERE id = NEW.user_id;
END;
CREATE TRIGGER entries_delete_version AFTER DELETE ON entries BEGIN
  UPDATE users SET entries_version = entries_version + 1 WHERE id = OLD.user_id;
END;

CREATE TABLE analysis_jobs (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  owner TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX idx_entries_user_order ON entries(user_id, created_at, id);
