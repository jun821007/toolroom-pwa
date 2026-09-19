-- =====================================================================
-- 升級：待辦事項 + 班級可改名／刪除／排序 + 備註可改刪
-- Supabase SQL Editor 貼這段 Run 一次
-- =====================================================================

-- 待辦
create table if not exists public.todos (
  id         serial primary key,
  body       text not null check (btrim(body) <> ''),
  done       boolean not null default false,
  pinned     boolean not null default false,
  sort       integer not null default 0,
  operator   text not null default '未署名',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_todos_open
  on public.todos (done, pinned desc, sort, id);

alter table public.todos enable row level security;

-- 刪班級時：庫存／備註跟著清；流水帳保留但班級欄位改 NULL
alter table public.logs drop constraint if exists logs_from_class_fkey;
alter table public.logs drop constraint if exists logs_to_class_fkey;
alter table public.logs
  add constraint logs_from_class_fkey
  foreign key (from_class) references public.classes(id) on delete set null;
alter table public.logs
  add constraint logs_to_class_fkey
  foreign key (to_class) references public.classes(id) on delete set null;
