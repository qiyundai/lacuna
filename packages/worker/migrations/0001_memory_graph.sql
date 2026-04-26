-- Memory graph: one row per user, JSON document accumulating concept nodes
CREATE TABLE IF NOT EXISTS memory_graph (
  user_id     TEXT    PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  graph_json  TEXT    NOT NULL DEFAULT '{"nodes":[],"processed_count":0}',
  last_updated INTEGER DEFAULT (unixepoch())
);

-- Range summaries: compressed prose for batches of older entries
CREATE TABLE IF NOT EXISTS range_summaries (
  id              TEXT    PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id         TEXT    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  from_entry_num  INTEGER NOT NULL,
  to_entry_num    INTEGER NOT NULL,
  summary_text    TEXT    NOT NULL,
  generated_at    INTEGER DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_range_summaries_user
  ON range_summaries(user_id, from_entry_num ASC);

-- Track how many entries have been extracted into the graph
ALTER TABLE patterns ADD COLUMN graph_extracted_through INTEGER NOT NULL DEFAULT 0;
