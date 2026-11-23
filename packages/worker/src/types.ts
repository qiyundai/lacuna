export interface Env {
  DB: D1Database;
  FRONTEND_ORIGIN: string;
  LEGACY_SYNC_ORIGIN?: string;
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

export interface EntryRow {
  id: string;
  user_id: string;
  body: string;
  created_at: number;
  solidified_at: number | null;
  kept_at: number | null;
}

export interface RangeSummaryRow {
  id: string;
  user_id: string;
  from_entry_num: number;
  to_entry_num: number;
  summary_text: string;
  generated_at: number;
}
