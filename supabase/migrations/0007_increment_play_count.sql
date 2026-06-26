-- 0007_increment_play_count.sql
-- 修复: recordPlayRemote 对他人视频 update 被 RLS(videos_update_own) 拒绝,导致播放数只在自己视频上涨。
-- 用 SECURITY DEFINER 函数原子自增任意公开视频的 play_count(绕过 RLS,且 play_count = play_count + 1 原子,无并发丢失)。

create or replace function public.increment_play_count(p_video_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.videos
  set play_count = play_count + 1
  where id = p_video_id and visibility = 'public';
$$;

-- 允许已登录与匿名用户调用(刷 feed 即计播放)
grant execute on function public.increment_play_count(uuid) to anon, authenticated;
