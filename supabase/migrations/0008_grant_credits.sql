-- 0008_grant_credits.sql
-- 领取体验额度：给当前登录用户加 N 额度(服务端落库,客户端 credits 仍只读)。
-- demo 用;真付费时替换。

create or replace function public.grant_credits(p_amount int)
returns int
language sql
security definer
set search_path = public
as $$
  update public.credits
  set balance = balance + p_amount
  where user_id = auth.uid()
  returning balance;
$$;

grant execute on function public.grant_credits(int) to authenticated;
