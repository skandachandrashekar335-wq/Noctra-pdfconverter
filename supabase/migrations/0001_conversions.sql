-- Noctra — conversion history schema.
--
-- Identity stays in Firebase Authentication. This database never sees a
-- password, a Firebase token, or any Google profile data: the Next.js route
-- handlers verify the Firebase ID token with the Admin SDK and then act here
-- with the service-role key, always scoping queries to the verified UID.
--
-- Apply with the Supabase SQL editor, or:
--   supabase db push --project-ref <your-project-ref>
--
-- ── Row Level Security ──────────────────────────────────────────────────────
-- RLS is ENABLED and no policy grants anything to `anon` or `authenticated`.
-- That is deliberate and is the whole point:
--   * the publishable/anon key is useless against this table — even if it
--     leaked, it returns zero rows and writes nothing;
--   * only the service role (which bypasses RLS) can touch the data, and it is
--     only ever reachable through our route handlers, which derive the owner
--     from a verified Firebase token rather than from the request body.
-- The restrictive policy below is defence-in-depth for the self-hosted case:
-- Firebase signs tokens with one shared key set across all projects, so a
-- token minted by some *other* Firebase project must never be accepted.

create table if not exists public.conversions (
  id                uuid primary key default gen_random_uuid(),

  -- The owner. This is the Firebase UID, set server-side from the verified
  -- ID token — never taken from the request body.
  user_uid         text not null,

  -- Client-generated key used to make record creation idempotent, so a
  -- retried POST cannot produce a duplicate history row.
  client_ref       uuid not null,

  original_file_name text not null,
  original_file_size bigint not null check (original_file_size >= 0),
  output_file_name   text,

  file_type        text not null check (file_type in ('pdf', 'docx', 'pptx')),

  status           text not null default 'pending'
                     check (status in ('pending', 'processing', 'completed', 'failed')),

  page_count       integer check (page_count is null or page_count > 0),
  error_message    text,

  created_at       timestamptz not null default now(),
  completed_at     timestamptz,

  -- A terminal status must carry the timestamp the client expects to render.
  constraint completed_at_on_terminal check (
    (status in ('completed', 'failed')) or completed_at is null
  )
);

-- One history row per conversion, even across client retries.
create unique index if not exists conversions_user_uid_client_ref_key
  on public.conversions (user_uid, client_ref);

-- Backs the "Recent conversions" list: newest first, per user.
create index if not exists conversions_user_uid_created_at_idx
  on public.conversions (user_uid, created_at desc);

alter table public.conversions enable row level security;

-- No permissive policy for anon/authenticated → deny by default.

-- Defence-in-depth (required when self-hosting, harmless on the hosted
-- platform): only accept tokens issued by *this* Firebase project. Restrictive
-- policies narrow rather than grant, so this cannot accidentally open access.
drop policy if exists "restrict to noctra firebase project" on public.conversions;
create policy "restrict to noctra firebase project"
  on public.conversions
  as restrictive
  to authenticated
  using (
    (auth.jwt() ->> 'iss') = 'https://securetoken.google.com/noctra-a7423'
    and (auth.jwt() ->> 'aud') = 'noctra-a7423'
  );

-- Belt and braces: explicitly revoke the roles that must never touch this
-- table. Even if a permissive policy is added later by mistake, these holds.
revoke all on public.conversions from anon;
revoke update, delete, insert on public.conversions from authenticated;
