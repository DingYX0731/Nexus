-- 0001_profiles_credits.sql
-- M2：用户资料 + 额度表 + RLS + 新用户触发器

-- profiles：用户公开资料，1:1 关联 auth.users
create table public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  username   text unique not null,
  avatar_url text,
  created_at timestamptz not null default now()
);

-- credits：用户额度
create table public.credits (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  balance int not null default 5
);

alter table public.profiles enable row level security;
alter table public.credits  enable row level security;

-- profiles：所有人可读，只能改/插自己的
create policy "profiles_read_all" on public.profiles
  for select using (true);
create policy "profiles_update_own" on public.profiles
  for update using (id = auth.uid());
create policy "profiles_insert_own" on public.profiles
  for insert with check (id = auth.uid());

-- credits：只能读自己的；客户端不能写（无 insert/update/delete policy → 默认拒绝）
create policy "credits_read_own" on public.credits
  for select using (user_id = auth.uid());

-- 新用户注册触发器：建 profile + credits
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, username)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', 'user_' || left(new.id::text, 8))
  );
  insert into public.credits (user_id, balance) values (new.id, 5);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
