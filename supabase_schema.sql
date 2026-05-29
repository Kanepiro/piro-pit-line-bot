-- Supabase SQL Editor で実行してください
-- はる/ピットの記憶倉庫 v0.6.0

create table if not exists public.line_users (
  line_user_id text primary key,
  display_name text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create table if not exists public.line_messages (
  id bigserial primary key,
  line_user_id text not null references public.line_users(line_user_id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  line_message_id text,
  created_at timestamptz not null default now()
);

create unique index if not exists line_messages_line_message_id_unique
  on public.line_messages(line_message_id)
  where line_message_id is not null;

create index if not exists line_messages_user_created_idx
  on public.line_messages(line_user_id, created_at desc);

create table if not exists public.person_memories (
  line_user_id text primary key references public.line_users(line_user_id) on delete cascade,
  memory_text text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- service_role key からだけ使う前提なので、RLSは有効化しない。
-- anon public key をブラウザ側に出してこのテーブルへ直接アクセスする運用はしないでください。
