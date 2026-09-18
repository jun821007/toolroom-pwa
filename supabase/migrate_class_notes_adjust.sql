-- =====================================================================
-- 升級：班級備註 + 班級起始／調整庫存（不扣公庫）
-- 已上線專案：Supabase SQL Editor 貼這段 Run 一次
-- =====================================================================

-- 班級隨手記（最新一筆給預覽，點開看全部歷史）
create table if not exists public.class_notes (
  id         bigserial primary key,
  class_id   integer not null references public.classes(id) on delete cascade,
  body       text not null check (btrim(body) <> ''),
  operator   text not null default '未署名',
  created_at timestamptz not null default now()
);

create index if not exists idx_class_notes_class
  on public.class_notes (class_id, created_at desc);

alter table public.class_notes enable row level security;

-- 流水帳新增 ADJUST（班級自行設定／調整貨量，不動公庫）
alter table public.logs drop constraint if exists logs_kind_check;
alter table public.logs
  add constraint logs_kind_check
  check (kind in ('RESTOCK', 'DISTRIBUTE', 'TRANSFER', 'ADJUST'));

-- ---------------------------------------------------------------------
-- RPC：把某班品項設成指定數量（絕對值），差多少就記多少
-- p_items：[{"item_id":1,"qty":5}, ...]  qty >= 0
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
