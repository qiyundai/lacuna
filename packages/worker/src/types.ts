export interface Env {
  DB: D1Database;
  FRONTEND_ORIGIN: string;
  JWT_SECRET: string;
  OPENAI_API_KEY?: string;
  OPENAI_MODEL?: string;
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  STRIPE_PRICE_ID?: string;
  REFLECTION_ACCOUNT_MICROS?: string;
  REFLECTION_GLOBAL_MICROS?: string;
  MODEL_INPUT_MICROS_PER_TOKEN?: string;
  MODEL_OUTPUT_MICROS_PER_TOKEN?: string;
}

export interface UserRow {
  id: string;
  email: string;
  magic_token: string | null;
  magic_token_expires_at: number | null;
  consent_given_at: number | null;
  created_at: number;
  ai_provider: 'chatgpt';
  entries_version: number;
  analyzed_version: number;
}

export interface EntryRow {
  id: string;
  user_id: string;
  body: string;
  created_at: number;
  solidified_at: number | null;
  kept_at: number | null;
}

export interface PatternRow {
  id: string;
  user_id: string;
  model_weights: string;
  entry_count_at_last_memoir: number;
  graph_extracted_through: number;
  last_updated: number;
}

export interface MemoryGraphRow {
  user_id: string;
  graph_json: string;
  last_updated: number;
}

export interface RangeSummaryRow {
  id: string;
  user_id: string;
  from_entry_num: number;
  to_entry_num: number;
  summary_text: string;
  generated_at: number;
}

export interface MemoirSnapshotRow {
  id: string;
  user_id: string;
  prose: string;
  generated_at: number;
}

export interface JwtPayload {
  jti: string;
  sub: string;
  email: string;
  iat: number;
  exp: number;
}
