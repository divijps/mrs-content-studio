-- Mrs Content Studio — Supabase schema
-- Run this once in your project's SQL Editor (Dashboard → SQL Editor → New query).
-- Idempotent: safe to re-run.

-- ---------- Tables ----------------------------------------------------------

create table if not exists public.collections (
  id text primary key,
  name text not null,
  parent_id text references public.collections (id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.assets (
  id text primary key,
  name text not null,
  filename text not null default '',
  kind text not null default 'image',
  duration_sec real,
  width int not null default 0,
  height int not null default 0,
  size_bytes bigint,
  status text not null default 'draft',
  favorite boolean not null default false,
  tags text[] not null default '{}',
  collection_id text references public.collections (id) on delete set null,
  focal_x real not null default 0.5,
  focal_y real not null default 0.4,
  storage_path text not null default '',
  thumb_path text not null default '',
  import_fingerprint text,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Backfill for projects created before video support (idempotent).
alter table public.assets add column if not exists kind text not null default 'image';
alter table public.assets add column if not exists duration_sec real;

create table if not exists public.asset_comments (
  id text primary key,
  asset_id text not null references public.assets (id) on delete cascade,
  author text not null default '',
  body text not null,
  x real not null default 0.5,
  y real not null default 0.5,
  w real,
  h real,
  resolved boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.comps (
  id text primary key,
  name text not null,
  status text not null default 'draft',
  layout_id text not null default 'poster',
  background_color_id text not null default 'bone',
  formats text[] not null default '{}',
  source_values jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.decks (
  id text primary key,
  name text not null,
  variants text[] not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists public.queue_items (
  id text primary key,
  comp_id text not null references public.comps (id) on delete cascade,
  format_ids text[] not null default '{}',
  added_at timestamptz not null default now()
);

create table if not exists public.planner_slots (
  id text primary key,
  kind text not null check (kind in ('grid', 'story')),
  position int not null default 0,
  comp_id text references public.comps (id) on delete cascade,
  asset_id text references public.assets (id) on delete cascade,
  label text
);

-- Brand hub: important links + saved copy/journal entries.
create table if not exists public.brand_links (
  id text primary key,
  label text not null default '',
  url text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.copy_folders (
  id text primary key,
  name text not null default '',
  parent_id text references public.copy_folders (id) on delete set null,
  created_at timestamptz not null default now()
);

-- Backfill for copy folders created before nesting (idempotent).
alter table public.copy_folders
  add column if not exists parent_id text references public.copy_folders (id) on delete set null;

create table if not exists public.journal_entries (
  id text primary key,
  kind text not null default 'copy' check (kind in ('copy', 'journal')),
  title text not null default '',
  body text not null default '',
  tags text[] not null default '{}',
  comments jsonb not null default '[]',
  folder_id text references public.copy_folders (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Backfill for projects created before the Copy library (idempotent).
alter table public.journal_entries
  add column if not exists folder_id text references public.copy_folders (id) on delete set null;
alter table public.journal_entries add column if not exists tags text[] not null default '{}';
alter table public.journal_entries add column if not exists comments jsonb not null default '[]';

-- Kanban tasks.
create table if not exists public.tasks (
  id text primary key,
  title text not null default '',
  status text not null default 'todo' check (status in ('todo', 'doing', 'review', 'done')),
  position int not null default 0,
  tags text[] not null default '{}',
  assignee text,
  source_comment_id text,
  source_label text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Backfill for tasks created before comment→task linking (idempotent).
alter table public.tasks add column if not exists source_comment_id text;
alter table public.tasks add column if not exists source_label text;

-- ---------- Row Level Security ----------------------------------------------
-- Single-team tool: every signed-in teammate has full access; anonymous has none.

do $$
declare
  t text;
begin
  foreach t in array array[
    'collections', 'assets', 'asset_comments', 'comps', 'decks',
    'queue_items', 'planner_slots', 'brand_links', 'journal_entries', 'tasks',
    'copy_folders'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "team-all" on public.%I', t);
    execute format(
      'create policy "team-all" on public.%I for all to authenticated using (true) with check (true)',
      t
    );
  end loop;
end $$;

-- ---------- Realtime ---------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'collections', 'assets', 'asset_comments', 'comps', 'decks',
    'queue_items', 'planner_slots', 'brand_links', 'journal_entries', 'tasks',
    'copy_folders'
  ] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception
      when duplicate_object then null;
    end;
  end loop;
end $$;

-- ---------- Storage buckets ---------------------------------------------------
-- originals + web-res derivatives. Public read (simple URLs); writes need auth.

insert into storage.buckets (id, name, public)
values ('assets', 'assets', true), ('thumbs', 'thumbs', true)
on conflict (id) do nothing;

drop policy if exists "team-write-assets" on storage.objects;
create policy "team-write-assets" on storage.objects
  for all to authenticated
  using (bucket_id in ('assets', 'thumbs'))
  with check (bucket_id in ('assets', 'thumbs'));

drop policy if exists "public-read-assets" on storage.objects;
create policy "public-read-assets" on storage.objects
  for select to anon
  using (bucket_id in ('assets', 'thumbs'));
