-- =====================================================================
-- 升級：公庫可調整起始／絕對貨量（不走「補貨」加減）
-- Supabase SQL Editor 貼這段 Run 一次
-- =====================================================================

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
