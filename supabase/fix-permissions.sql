-- 若线上提示「权限不足」，在 Supabase → SQL Editor 执行本文件（可重复执行）

grant usage on schema public to postgres, service_role;

grant all on table public.hi_messages to postgres, service_role;

grant usage, select on sequence public.hi_messages_id_seq to postgres, service_role;
