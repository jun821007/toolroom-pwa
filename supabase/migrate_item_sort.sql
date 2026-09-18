-- =====================================================================
-- 升級：品項可排序 +（班級本來就有 sort，這裡只補說明）
-- 已跑過 schema.sql 的專案，到 Supabase SQL Editor 貼這段 Run 一次即可
-- =====================================================================

alter table public.items
  add column if not exists sort integer not null default 0;

-- 依目前名稱順序補上 sort（只改還是 0 的列，避免覆蓋你已手動排過的）
with ordered as (
  select id, row_number() over (order by name) as rn
  from public.items
  where sort = 0
)
update public.items i
   set sort = o.rn
  from ordered o
 where i.id = o.id;

-- 驗證
select name, sort, qty from public.items order by sort, name;
