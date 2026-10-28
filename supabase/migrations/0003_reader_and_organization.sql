-- Noctra reader, study metadata and organization fields.
--
-- Documents remain local/browser-memory objects. These tables contain only
-- user-owned metadata keyed by a SHA-256 document identity.

alter table public.conversions
  add column if not exists display_name text,
  add column if not exists is_favorite boolean not null default false,
  add column if not exists tags text[] not null default '{}',
  add column if not exists document_key text;

alter table public.conversions
  drop constraint if exists conversions_document_key_check;

alter table public.conversions
  add constraint conversions_document_key_check
  check (document_key is null or document_key ~ '^[0-9a-f]{64}$');

create index if not exists conversions_user_uid_favorite_created_idx
  on public.conversions (user_uid, is_favorite, created_at desc);

create index if not exists conversions_user_uid_tags_idx
  on public.conversions using gin (tags);

create table if not exists public.reader_preferences (
  user_uid text not null,
  document_key text not null check (document_key ~ '^[0-9a-f]{64}$'),
  page_number integer not null default 1 check (page_number > 0),
  zoom numeric not null default 1 check (zoom >= 0.5 and zoom <= 3),
  theme text not null default 'night' check (theme in ('night', 'sepia', 'paper')),
  updated_at timestamptz not null default now(),
  primary key (user_uid, document_key)
);

create table if not exists public.reader_annotations (
  id uuid primary key default gen_random_uuid(),
  user_uid text not null,
  document_key text not null check (document_key ~ '^[0-9a-f]{64}$'),
  page_number integer not null check (page_number > 0),
  kind text not null check (kind in ('bookmark', 'note', 'highlight')),
  quote text,
  note text,
  rects jsonb,
  color text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reader_annotations_content_check check (
    (kind = 'bookmark' and quote is null and note is null and rects is null)
    or (kind = 'note' and note is not null and length(note) between 1 and 4000)
    or (kind = 'highlight' and quote is not null and length(quote) between 1 and 1000 and rects is not null)
  )
);

create unique index if not exists reader_annotations_one_bookmark_per_page
  on public.reader_annotations (user_uid, document_key, page_number)
  where kind = 'bookmark';

create index if not exists reader_annotations_user_document_page_idx
  on public.reader_annotations (user_uid, document_key, page_number, created_at);

alter table public.reader_preferences enable row level security;
alter table public.reader_annotations enable row level security;

drop policy if exists "restrict reader preferences to noctra firebase project" on public.reader_preferences;
create policy "restrict reader preferences to noctra firebase project"
  on public.reader_preferences
  as restrictive
  to authenticated
  using (
    (auth.jwt() ->> 'iss') = 'https://securetoken.google.com/noctra-a7423'
    and (auth.jwt() ->> 'aud') = 'noctra-a7423'
  );

drop policy if exists "restrict reader annotations to noctra firebase project" on public.reader_annotations;
create policy "restrict reader annotations to noctra firebase project"
  on public.reader_annotations
  as restrictive
  to authenticated
  using (
    (auth.jwt() ->> 'iss') = 'https://securetoken.google.com/noctra-a7423'
    and (auth.jwt() ->> 'aud') = 'noctra-a7423'
  );

revoke all on public.reader_preferences from anon;
revoke all on public.reader_preferences from authenticated;
revoke all on public.reader_annotations from anon;
revoke all on public.reader_annotations from authenticated;
