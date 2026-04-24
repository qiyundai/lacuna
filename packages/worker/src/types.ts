export interface Env {
  DB: D1Database;
  FRONTEND_ORIGIN: string;
  JWT_SECRET: string;
  ANTHROPIC_API_KEY: string;
  RESEND_API_KEY?: string;
}

export interface UserRow {
  id: string;
  email: string | null;
  recovery_code_hash: string | null;
  ai_consent_at: number | null;
  created_at: number;
}

export interface EmailOTPRow {
  id: string;
  user_id: string;
  code_hash: string;
  expires_at: number;
}

export interface CredentialRow {
  id: string;
  user_id: string;
  public_key: string;
  sign_count: number;
  created_at: number;
}

export interface ChallengeRow {
  challenge: string;
  user_id: string | null;
  type: 'registration' | 'authentication';
  expires_at: number;
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
  email: string | null;
  iat: number;
  exp: number;
}
