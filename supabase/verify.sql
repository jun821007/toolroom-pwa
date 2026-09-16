-- =====================================================================
-- 驗證用：跑完 schema.sql 之後，貼這段到 Supabase SQL Editor 執行
-- 四個數字都對，就代表資料庫建好了
-- =====================================================================

select '班級數（應為 20）'      as 檢查項目, count(*)::text as 結果 from public.classes
union all
select '品項數（應為 22）',      count(*)::text from public.items
union all
select '公庫總件數（應為 405）', sum(qty)::text from public.items
union all
select 'RPC 數（應為 3）',       count(*)::text
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname in ('restock', 'distribute', 'transfer');

-- 逐項核對公庫庫存
select name as 品項, qty as 數量, unit as 單位
from public.items
order by qty desc, name;
