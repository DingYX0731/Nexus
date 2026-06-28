-- 0009_social.sql
-- 社交基建：follows（关注关系）+ notifications（通知）+ RLS。

create table public.follows (
  follower_id uuid references public.profiles(id) on delete cascade,
  followee_id uuid references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (follower_id, followee_id),
  constraint no_self_follow check (follower_id <> followee_id)
);

create table public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,  -- 接收者
  actor_id   uuid references public.profiles(id) on delete cascade,            -- 触发者
  type       text not null,         -- like | comment | fork | follow
  video_id   uuid references public.videos(id) on delete cascade,
  comment_id uuid references public.comments(id) on delete cascade,
  read       boolean not null default false,
  created_at timestamptz not null default now()
);

create index follows_follower_idx   on public.follows(follower_id);
create index follows_followee_idx   on public.follows(followee_id);
create index notifications_user_idx on public.notifications(user_id, created_at desc);

alter table public.follows       enable row level security;
alter table public.notifications enable row level security;

-- follows：所有人可读；只能增删自己的
create policy "follows_read_all" on public.follows
  for select using (true);
create policy "follows_insert_own" on public.follows
  for insert with check (follower_id = auth.uid());
create policy "follows_delete_own" on public.follows
  for delete using (follower_id = auth.uid());

-- notifications：只读自己的；客户端不能 insert（只由触发器写）；可 update 自己的(标记已读)
create policy "notifications_read_own" on public.notifications
  for select using (user_id = auth.uid());
create policy "notifications_update_own" on public.notifications
  for update using (user_id = auth.uid());
