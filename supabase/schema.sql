-- =====================================================================
-- 衛生組工具室庫存管理系統 — 精簡版 Schema
-- 貼到 Supabase Dashboard → SQL Editor → Run 即可（可重複執行）
-- 6 張表：items / classes / class_stock / logs / class_notes / todos
-- 5 支 RPC：restock / distribute / transfer / set_class_stock / set_public_stock
-- =====================================================================

-- ---------------------------------------------------------------------
-- 資料表
-- ---------------------------------------------------------------------
create table if not exists public.classes (
  id   serial primary key,
  name text not null unique,
  sort integer not null default 0
);

create table if not exists public.items (
  id     serial primary key,
  name   text not null unique,
  unit   text not null default '個',
  qty    integer not null default 0 check (qty >= 0),   -- 公庫現存量
  sort   integer not null default 0,                    -- 顯示順序（小的在前）
  active boolean not null default true
);

create table if not exists public.class_stock (
  class_id integer not null references public.classes(id) on delete cascade,
  item_id  integer not null references public.items(id)   on delete cascade,
  qty      integer not null default 0 check (qty >= 0),
  primary key (class_id, item_id)
);

create table if not exists public.logs (
  id         bigserial primary key,
  kind       text    not null check (kind in ('RESTOCK', 'DISTRIBUTE', 'TRANSFER', 'ADJUST')),
  from_class integer references public.classes(id) on delete set null,  -- NULL = 衛生組公庫
  to_class   integer references public.classes(id) on delete set null,  -- NULL = 衛生組公庫
  item_id    integer not null references public.items(id),
  qty        integer not null check (qty > 0),
  operator   text    not null default '未署名',
  note       text,
  created_at timestamptz not null default now()
);

create table if not exists public.class_notes (
  id         bigserial primary key,
  class_id   integer not null references public.classes(id) on delete cascade,
  body       text not null check (btrim(body) <> ''),
  operator   text not null default '未署名',
  created_at timestamptz not null default now()
);

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

create index if not exists idx_logs_created on public.logs (created_at desc);
create index if not exists idx_logs_item    on public.logs (item_id);
create index if not exists idx_stock_class  on public.class_stock (class_id);
create index if not exists idx_class_notes_class on public.class_notes (class_id, created_at desc);
create index if not exists idx_todos_open on public.todos (done, pinned desc, sort, id);

-- ---------------------------------------------------------------------
-- 安全性：開 RLS 但不給任何政策
-- → 前端 anon key 完全碰不到，只有後端 service_role 能讀寫
-- ---------------------------------------------------------------------
alter table public.classes     enable row level security;
alter table public.items       enable row level security;
alter table public.class_stock enable row level security;
alter table public.logs        enable row level security;
alter table public.class_notes enable row level security;
alter table public.todos       enable row level security;

-- 舊專案升級：補上 items.sort（新專案 create table 已含）
alter table public.items add column if not exists sort integer not null default 0;

-- ---------------------------------------------------------------------
-- RPC 1：公庫補貨
-- ---------------------------------------------------------------------
create or replace function public.restock(
  p_item     integer,
  p_qty      integer,
  p_operator text default '未署名',
  p_note     text default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_after integer;
begin
  if p_qty is null or p_qty <= 0 then
    raise exception '補貨數量必須大於 0';
  end if;

  update items set qty = qty + p_qty where id = p_item returning qty into v_after;
  if v_after is null then
    raise exception '品項不存在';
  end if;

  insert into logs (kind, from_class, to_class, item_id, qty, operator, note)
  values ('RESTOCK', null, null, p_item, p_qty, coalesce(nullif(btrim(p_operator), ''), '未署名'), p_note);

  return v_after;
end;
$$;

-- ---------------------------------------------------------------------
-- RPC 2：公庫批量發放給班級（扣公庫、加班級）
-- p_items 格式：[{"item_id":1,"qty":5}, ...]
-- 任一品項不足 → 整筆 rollback
-- ---------------------------------------------------------------------
create or replace function public.distribute(
  p_to       integer,
  p_items    jsonb,
  p_operator text default '未署名',
  p_note     text default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_op    text := coalesce(nullif(btrim(p_operator), ''), '未署名');
  v_count integer := 0;
  r       record;
  v_name  text;
  v_unit  text;
  v_have  integer;
begin
  if not exists (select 1 from classes where id = p_to) then
    raise exception '接收班級不存在';
  end if;

  for r in
    select (e->>'item_id')::integer as item_id, sum((e->>'qty')::integer)::integer as qty
    from jsonb_array_elements(p_items) e
    group by 1
    order by 1                      -- 固定順序取鎖，避免併發死結
  loop
    if r.qty <= 0 then
      raise exception '數量必須大於 0';
    end if;

    select name, unit, qty into v_name, v_unit, v_have
    from items where id = r.item_id for update;

    if v_name is null then
      raise exception '品項不存在';
    end if;
    if v_have < r.qty then
      raise exception '公庫「%」只剩 % %，不夠發 % %', v_name, v_have, v_unit, r.qty, v_unit;
    end if;

    update items set qty = qty - r.qty where id = r.item_id;

    insert into class_stock (class_id, item_id, qty)
    values (p_to, r.item_id, r.qty)
    on conflict (class_id, item_id) do update set qty = class_stock.qty + excluded.qty;

    insert into logs (kind, from_class, to_class, item_id, qty, operator, note)
    values ('DISTRIBUTE', null, p_to, r.item_id, r.qty, v_op, p_note);

    v_count := v_count + 1;
  end loop;

  if v_count = 0 then
    raise exception '沒有選擇任何品項';
  end if;

  return v_count;
end;
$$;

-- ---------------------------------------------------------------------
-- RPC 3：跨班調貨（扣 A 班、加 B 班，公庫數量不變）
-- 會檢查 A 班實際持有量，不足 → 整筆 rollback
-- ---------------------------------------------------------------------
create or replace function public.transfer(
  p_from     integer,
  p_to       integer,
  p_items    jsonb,
  p_operator text default '未署名',
  p_note     text default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_op        text := coalesce(nullif(btrim(p_operator), ''), '未署名');
  v_from_name text;
  v_count     integer := 0;
  r           record;
  v_name      text;
  v_unit      text;
  v_have      integer;
begin
  if p_from = p_to then
    raise exception '來源班級與目標班級不可相同';
  end if;

  select name into v_from_name from classes where id = p_from;
  if v_from_name is null then
    raise exception '來源班級不存在';
  end if;
  if not exists (select 1 from classes where id = p_to) then
    raise exception '目標班級不存在';
  end if;

  for r in
    select (e->>'item_id')::integer as item_id, sum((e->>'qty')::integer)::integer as qty
    from jsonb_array_elements(p_items) e
    group by 1
    order by 1
  loop
    if r.qty <= 0 then
      raise exception '數量必須大於 0';
    end if;

    select name, unit into v_name, v_unit from items where id = r.item_id;
    if v_name is null then
      raise exception '品項不存在';
    end if;

    select qty into v_have
    from class_stock
    where class_id = p_from and item_id = r.item_id
    for update;

    if v_have is null or v_have < r.qty then
      raise exception '% 只有 % %「%」，不夠調 % %',
        v_from_name, coalesce(v_have, 0), v_unit, v_name, r.qty, v_unit;
    end if;

    update class_stock set qty = qty - r.qty
    where class_id = p_from and item_id = r.item_id;

    insert into class_stock (class_id, item_id, qty)
    values (p_to, r.item_id, r.qty)
    on conflict (class_id, item_id) do update set qty = class_stock.qty + excluded.qty;

    insert into logs (kind, from_class, to_class, item_id, qty, operator, note)
    values ('TRANSFER', p_from, p_to, r.item_id, r.qty, v_op, p_note);

    v_count := v_count + 1;
  end loop;

  if v_count = 0 then
    raise exception '沒有選擇任何品項';
  end if;

  return v_count;
end;
$$;

-- ---------------------------------------------------------------------
-- RPC 4：班級起始／調整庫存（絕對值，不扣公庫）
-- ---------------------------------------------------------------------
create or replace function public.set_class_stock(
  p_class    integer,
  p_items    jsonb,
  p_operator text default '未署名',
  p_note     text default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_op    text := coalesce(nullif(btrim(p_operator), ''), '未署名');
  v_count integer := 0;
  r       record;
  v_name  text;
  v_unit  text;
  v_have  integer;
  v_delta integer;
  v_note  text;
begin
  if not exists (select 1 from classes where id = p_class) then
    raise exception '班級不存在';
  end if;

  for r in
    select (e->>'item_id')::integer as item_id, (e->>'qty')::integer as qty
    from jsonb_array_elements(p_items) e
    order by 1
  loop
    if r.qty is null or r.qty < 0 then
      raise exception '數量不能是負的';
    end if;

    select name, unit into v_name, v_unit from items where id = r.item_id and active = true;
    if v_name is null then
      raise exception '品項不存在或已停用';
    end if;

    select qty into v_have
    from class_stock
    where class_id = p_class and item_id = r.item_id
    for update;

    v_have := coalesce(v_have, 0);
    if v_have = r.qty then
      continue;
    end if;

    insert into class_stock (class_id, item_id, qty)
    values (p_class, r.item_id, r.qty)
    on conflict (class_id, item_id) do update set qty = excluded.qty;

    v_delta := abs(r.qty - v_have);
    v_note := format('調整為 %s%s（原 %s%s）', r.qty, v_unit, v_have, v_unit);
    if p_note is not null and btrim(p_note) <> '' then
      v_note := v_note || '｜' || btrim(p_note);
    end if;

    insert into logs (kind, from_class, to_class, item_id, qty, operator, note)
    values ('ADJUST', p_class, p_class, r.item_id, v_delta, v_op, v_note);

    v_count := v_count + 1;
  end loop;

  if v_count = 0 then
    raise exception '沒有任何數量被改動';
  end if;

  return v_count;
end;
$$;

-- ---------------------------------------------------------------------
-- RPC 5：公庫起始／調整庫存（絕對值）
-- ---------------------------------------------------------------------
create or replace function public.set_public_stock(
  p_items    jsonb,
  p_operator text default '未署名',
  p_note     text default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_op    text := coalesce(nullif(btrim(p_operator), ''), '未署名');
  v_count integer := 0;
  r       record;
  v_name  text;
  v_unit  text;
  v_have  integer;
  v_delta integer;
  v_note  text;
begin
  for r in
    select (e->>'item_id')::integer as item_id, (e->>'qty')::integer as qty
    from jsonb_array_elements(p_items) e
    order by 1
  loop
    if r.qty is null or r.qty < 0 then
      raise exception '數量不能是負的';
    end if;

    select name, unit, qty into v_name, v_unit, v_have
    from items
    where id = r.item_id and active = true
    for update;

    if v_name is null then
      raise exception '品項不存在或已停用';
    end if;

    v_have := coalesce(v_have, 0);
    if v_have = r.qty then
      continue;
    end if;

    update items set qty = r.qty where id = r.item_id;

    v_delta := abs(r.qty - v_have);
    v_note := format('公庫調整為 %s%s（原 %s%s）', r.qty, v_unit, v_have, v_unit);
    if p_note is not null and btrim(p_note) <> '' then
      v_note := v_note || '｜' || btrim(p_note);
    end if;

    insert into logs (kind, from_class, to_class, item_id, qty, operator, note)
    values ('ADJUST', null, null, r.item_id, v_delta, v_op, v_note);

    v_count := v_count + 1;
  end loop;

  if v_count = 0 then
    raise exception '沒有任何數量被改動';
  end if;

  return v_count;
end;
$$;

-- =====================================================================
-- 初始資料
-- =====================================================================

-- 班級／持有點（衛生組公庫不列在這，程式裡以 NULL 代表）
insert into public.classes (name, sort) values
  ('一年一班', 101), ('一年二班', 102),
  ('二年一班', 201), ('二年二班', 202),
  ('三年一班', 301), ('三年二班', 302),
  ('四年一班', 401), ('四年二班', 402),
  ('五年一班', 501), ('五年二班', 502),
  ('六年一班', 601), ('六年二班', 602),
  ('天使班',   701), ('資源班',   702),
  ('前棟1F一年級廁所', 801),
  ('前棟1F友善廁所',   802),
  ('前棟2F廁所',       803),
  ('前棟3F廁所',       804),
  ('後棟1F廁所',       805),
  ('後棟2F廁所',       806)
on conflict (name) do update set sort = excluded.sort;

-- 工具室現有庫存（大垃圾袋 7+1=8；小垃圾袋 3*31+1=94）
-- sort 決定公庫／發放清單的顯示順序
insert into public.items (name, unit, qty, sort) values
  ('殺蟲劑',           '罐',  43,  1),
  ('漂白水',           '瓶',   4,  2),
  ('漱口水',           '瓶',   1,  3),
  ('大垃圾袋',         '包',   8,  4),
  ('小垃圾袋',         '包',  94,  5),
  ('浴廁清潔劑',       '瓶',  26,  6),
  ('抹布',             '條',   7,  7),
  ('拖把(擰乾式)',     '支',   5,  8),
  ('拖把',             '支',  15,  9),
  ('紅垃圾桶',         '個',  12, 10),
  ('藍垃圾桶',         '個',   8, 11),
  ('短夾',             '支', 103, 12),
  ('長夾',             '支',   1, 13),
  ('籃子',             '個',   2, 14),
  ('竹掃把',           '支',  14, 15),
  ('掃把',             '支',   6, 16),
  ('畚斗',             '個',  26, 17),
  ('可裝擰水器的水桶', '個',  10, 18),
  ('擰水器',           '個',  11, 19),
  ('水桶',             '個',   7, 20),
  ('馬桶通',           '支',   1, 21),
  ('馬桶刷',           '支',   1, 22)
on conflict (name) do update set sort = excluded.sort;
