-- AtomFable Hi 广场 · 在 Supabase → SQL Editor 里整段执行一次

create table if not exists public.hi_messages (
  id bigint generated always as identity primary key,
  nick text not null check (char_length(trim(nick)) between 1 and 20),
  content text not null check (char_length(trim(content)) between 1 and 500),
  source_label text check (source_label is null or char_length(source_label) <= 40),
  source_url text check (source_url is null or char_length(source_url) <= 500),
  client_token uuid,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists hi_messages_created_at_idx
  on public.hi_messages (created_at asc);

create index if not exists hi_messages_client_token_created_idx
  on public.hi_messages (client_token, created_at desc);

alter table public.hi_messages enable row level security;

-- 不创建 anon 策略：浏览器不能直接读写表，只走 Vercel API（service_role）
