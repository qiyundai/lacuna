-- The desktop companion and its hosted journal API were removed before release.
-- These tables held only pre-release prototype data and no longer have routes.
-- Kept: rate_limits (sync throttling), reflection_* (reserved reflections) and browser_sync*.
DROP TABLE IF EXISTS encrypted_vault_chunks;
DROP TABLE IF EXISTS encrypted_vaults;
DROP TABLE IF EXISTS auth_sessions;
DROP TABLE IF EXISTS openai_login_challenges;
DROP TABLE IF EXISTS openai_identities;
DROP TABLE IF EXISTS analysis_jobs;
DROP TABLE IF EXISTS range_summaries;
DROP TABLE IF EXISTS memory_graph;
DROP TABLE IF EXISTS memoir_snapshots;
DROP TABLE IF EXISTS patterns;
DROP TABLE IF EXISTS entries;
DROP TABLE IF EXISTS users;
