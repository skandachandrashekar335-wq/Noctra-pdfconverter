-- Noctra 3.0 — Supabase Auth, User Identities, and Rate Limiting
--
-- This migration establishes:
-- 1. Identity mapping between Supabase Auth (UUID) and legacy Firebase UIDs (text).
-- 2. Durable server-side API rate limiting table for serverless execution.
-- 3. User privacy consent tracking (AI study consent and telemetry preferences).
-- 4. Unified account deletion procedures for GDPR / CCPA compliance.
-- 5. Updated RLS policies supporting both Supabase Auth and Firebase Auth tokens.

-- 1. Identity Mapping Table
create table if not exists public.user_identities (
  supabase_uid uuid not null primary key,
  firebase_uid text unique,
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists user_identities_firebase_uid_idx
  on public.user_identities (firebase_uid);

-- 2. API Rate Limiting Table
create table if not exists public.api_rate_limits (
  key text primary key,
  count integer not null default 1,
  reset_at timestamptz not null
);

create index if not exists api_rate_limits_reset_at_idx
  on public.api_rate_limits (reset_at);

-- 3. User Privacy and Consent Table
create table if not exists public.user_consents (
  user_uid text primary key,
  ai_consent boolean not null default false,
  analytics_consent boolean not null default false,
  updated_at timestamptz not null default now()
);

-- 4. Account Deletion Function
create or replace function public.delete_user_data(target_uid text)
returns void
language plpgsql
security definer
as $$
declare
  mapped_fb text;
begin
  -- Resolve any mapped Firebase UID
  select firebase_uid into mapped_fb
  from public.user_identities
  where supabase_uid::text = target_uid;

  -- Delete conversions
  delete from public.conversions
  where user_uid = target_uid
     or (mapped_fb is not null and user_uid = mapped_fb);

  -- Delete reader preferences
  delete from public.reader_preferences
  where user_uid = target_uid
     or (mapped_fb is not null and user_uid = mapped_fb);

  -- Delete reader annotations
  delete from public.reader_annotations
  where user_uid = target_uid
     or (mapped_fb is not null and user_uid = mapped_fb);

  -- Delete privacy consents
  delete from public.user_consents
  where user_uid = target_uid
     or (mapped_fb is not null and user_uid = mapped_fb);

  -- Delete identity mappings
  delete from public.user_identities
  where supabase_uid::text = target_uid
     or firebase_uid = target_uid;
end;
$$;

-- 5. Enable Row Level Security on new tables
alter table public.user_identities enable row level security;
alter table public.api_rate_limits enable row level security;
alter table public.user_consents enable row level security;

-- Revoke direct anon/authenticated access; server routes handle operations via service role
revoke all on public.user_identities from anon;
revoke all on public.api_rate_limits from anon;
revoke all on public.user_consents from anon;
revoke all on public.user_identities from authenticated;
revoke all on public.api_rate_limits from authenticated;
revoke all on public.user_consents from authenticated;
