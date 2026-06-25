-- 0002_content.sql
-- M3：视频/点赞/评论表 + 统计视图 + RLS

create table public.videos (
  id            uuid primary key default gen_random_uuid(),
  author_id     uuid references public.profiles(id) on delete set null,
  parent_id     uuid references public.videos(id) on delete set null,
  root_id       uuid not null,
  remix_kind    text,
  depth         int not null default 0,
  prompt        text not null,
  video_url     text not null,
  thumbnail_url text,
  tail_frame_url text,
  duration_ms   int,
  width         int,
  height        int,
  ai_provider   text,
  edit_metadata jsonb,
  status        text not null default 'ready',
  visibility    text not null default 'private',
  play_count    int not null default 0,
  created_at    timestamptz not null default now()
);

create table public.likes (
  user_id    uuid references public.profiles(id) on delete cascade,
  video_id   uuid references public.videos(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, video_id)
);

create table public.comments (
  id         uuid primary key default gen_random_uuid(),
  video_id   uuid references public.videos(id) on delete cascade,
  author_id  uuid references public.profiles(id) on delete set null,
  body       text not null,
  created_at timestamptz not null default now()
);

create index videos_root_idx   on public.videos(root_id);
create index videos_author_idx on public.videos(author_id);
create index comments_video_idx on public.comments(video_id);

-- 统计视图：实时聚合 like/comment/fork
create view public.video_with_stats as
select
  v.*,
  coalesce(l.cnt, 0) as like_count,
  coalesce(c.cnt, 0) as comment_count,
  coalesce(f.cnt, 0) as fork_count
from public.videos v
left join (select video_id, count(*) cnt from public.likes group by video_id) l on l.video_id = v.id
left join (select video_id, count(*) cnt from public.comments group by video_id) c on c.video_id = v.id
left join (select parent_id, count(*) cnt from public.videos where parent_id is not null group by parent_id) f on f.parent_id = v.id;

alter table public.videos   enable row level security;
alter table public.likes    enable row level security;
alter table public.comments enable row level security;

-- videos：public 所有人可读；草稿仅作者可读；只能增改删自己的
create policy "videos_read_public_or_own" on public.videos
  for select using (visibility = 'public' or author_id = auth.uid());
create policy "videos_insert_own" on public.videos
  for insert with check (author_id = auth.uid());
create policy "videos_update_own" on public.videos
  for update using (author_id = auth.uid());
create policy "videos_delete_own" on public.videos
  for delete using (author_id = auth.uid());

-- likes：所有人可读；只能增删自己的
create policy "likes_read_all" on public.likes
  for select using (true);
create policy "likes_insert_own" on public.likes
  for insert with check (user_id = auth.uid());
create policy "likes_delete_own" on public.likes
  for delete using (user_id = auth.uid());

-- comments：跟随视频可见性读；登录可发；只能删自己的
create policy "comments_read" on public.comments
  for select using (
    exists (select 1 from public.videos v
            where v.id = comments.video_id
              and (v.visibility = 'public' or v.author_id = auth.uid()))
  );
create policy "comments_insert_own" on public.comments
  for insert with check (author_id = auth.uid());
create policy "comments_delete_own" on public.comments
  for delete using (author_id = auth.uid());
