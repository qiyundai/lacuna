ALTER TABLE entries ADD COLUMN kept_at INTEGER;
CREATE INDEX idx_entries_kept ON entries(user_id, kept_at DESC) WHERE kept_at IS NOT NULL;
