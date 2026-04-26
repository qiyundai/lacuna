export interface Env {
  DB: D1Database;
  FRONTEND_ORIGIN: string;
  JWT_SECRET: string;
  RESEND_API_KEY: string;
  ANTHROPIC_API_KEY: string;
}

export interface UserRow {
  id: string;
  email: string;
  magic_token: string | null;
  magic_token_expires_at: number | null;
  created_at: number;
}

export interface EntryRow {
  id: string;
  user_id: string;
  body: string;
  created_at: number;
  solidified_at: number | null;
}

export interface PatternRow {
  id: string;
  user_id: string;
  model_weights: string;
  entry_count_at_last_memoir: number;
  last_updated: number;
}

export interface MemoirSnapshotRow {
  id: string;
  user_id: string;
  prose: string;
  generated_at: number;
}

export interface JwtPayload {
  sub: string;
  email: string;
  iat: number;
  exp: number;
}
