ALTER TABLE reflection_accounts ADD COLUMN consent_notice TEXT;
ALTER TABLE reflection_accounts ADD COLUMN consent_changed_at INTEGER;
UPDATE reflection_accounts SET consent = consent + 1 WHERE consent % 2 = 1;
