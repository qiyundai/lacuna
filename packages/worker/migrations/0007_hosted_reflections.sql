CREATE TABLE reflection_accounts (
  id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, customer TEXT UNIQUE,
  paid_until INTEGER NOT NULL DEFAULT 0, billing_revision INTEGER NOT NULL DEFAULT 0,
  consent INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE reflection_challenges (
  email TEXT PRIMARY KEY, digest TEXT NOT NULL, expires INTEGER NOT NULL
);
CREATE TABLE reflection_sessions (
  id TEXT PRIMARY KEY, account TEXT NOT NULL REFERENCES reflection_accounts(id), expires INTEGER NOT NULL
);
CREATE TABLE reflection_usage (
  id TEXT PRIMARY KEY, account TEXT NOT NULL REFERENCES reflection_accounts(id),
  month TEXT NOT NULL, micros INTEGER NOT NULL, input_tokens INTEGER, output_tokens INTEGER,
  unit TEXT NOT NULL, started INTEGER NOT NULL
);
CREATE INDEX reflection_month ON reflection_usage(month, account);
CREATE INDEX reflection_recent_unit ON reflection_usage(account, unit, started);
