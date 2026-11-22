CREATE TABLE browser_sync (
  slot TEXT PRIMARY KEY,
  version INTEGER NOT NULL,
  iv TEXT,
  write_id TEXT NOT NULL
);

CREATE TABLE browser_sync_chunks (
  slot TEXT NOT NULL REFERENCES browser_sync(slot),
  part INTEGER NOT NULL,
  ciphertext TEXT NOT NULL,
  PRIMARY KEY (slot, part)
);
