CREATE TABLE sync_capacity (
  id INTEGER PRIMARY KEY CHECK(id=1),
  used_bytes INTEGER NOT NULL CHECK(used_bytes>=0)
);
INSERT INTO sync_capacity SELECT 1,COALESCE(SUM(length(ciphertext)),0) FROM browser_sync_chunks;
CREATE TRIGGER sync_chunk_added AFTER INSERT ON browser_sync_chunks BEGIN
  UPDATE sync_capacity SET used_bytes=used_bytes+length(NEW.ciphertext) WHERE id=1;
END;
CREATE TRIGGER sync_chunk_removed AFTER DELETE ON browser_sync_chunks BEGIN
  UPDATE sync_capacity SET used_bytes=used_bytes-length(OLD.ciphertext) WHERE id=1;
END;
ALTER TABLE reflection_accounts ADD COLUMN billing_checked INTEGER NOT NULL DEFAULT 0;
ALTER TABLE reflection_accounts ADD COLUMN checkout_key TEXT;
ALTER TABLE reflection_accounts ADD COLUMN checkout_started INTEGER;
CREATE INDEX reflection_reconcile ON reflection_accounts(billing_checked) WHERE customer IS NOT NULL;
CREATE INDEX reflection_usage_age ON reflection_usage(started);
CREATE INDEX reflection_challenge_expiry ON reflection_challenges(expires);
CREATE INDEX reflection_session_expiry ON reflection_sessions(expires);

CREATE TABLE erased_usage_totals (
  month TEXT PRIMARY KEY,
  micros INTEGER NOT NULL
);
CREATE TRIGGER erase_reflection_account BEFORE DELETE ON reflection_accounts BEGIN
  INSERT INTO erased_usage_totals(month,micros)
    SELECT month,SUM(micros) FROM reflection_usage WHERE account=OLD.id AND month=strftime('%Y-%m','now') GROUP BY month
    ON CONFLICT(month) DO UPDATE SET micros=micros+excluded.micros;
  DELETE FROM reflection_usage WHERE account=OLD.id;
  DELETE FROM reflection_sessions WHERE account=OLD.id;
  DELETE FROM reflection_challenges WHERE email=OLD.email;
END;
