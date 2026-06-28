-- 0010_notification_triggers.sql
-- 通知触发器：在 likes/comments/videos(续写)/follows 插入时自动写 notifications。
-- 自己对自己的动作不发。SECURITY DEFINER 绕过 notifications 的 insert 限制。

-- like：给视频作者发，actor=点赞者
create or replace function public.notify_on_like()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_author uuid;
begin
  select author_id into v_author from public.videos where id = new.video_id;
  if v_author is not null and v_author <> new.user_id then
    insert into public.notifications (user_id, actor_id, type, video_id)
    values (v_author, new.user_id, 'like', new.video_id);
  end if;
  return new;
end; $$;
create trigger on_like_created after insert on public.likes
  for each row execute function public.notify_on_like();

-- comment：给视频作者发，actor=评论者
create or replace function public.notify_on_comment()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_author uuid;
begin
  select author_id into v_author from public.videos where id = new.video_id;
  if v_author is not null and v_author <> new.author_id then
    insert into public.notifications (user_id, actor_id, type, video_id, comment_id)
    values (v_author, new.author_id, 'comment', new.video_id, new.id);
  end if;
  return new;
end; $$;
create trigger on_comment_created after insert on public.comments
  for each row execute function public.notify_on_comment();

-- fork：续写/remix（videos.parent_id 非空）时给父视频作者发，actor=新视频作者
create or replace function public.notify_on_fork()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_parent_author uuid;
begin
  if new.parent_id is not null then
    select author_id into v_parent_author from public.videos where id = new.parent_id;
    if v_parent_author is not null and v_parent_author <> new.author_id then
      insert into public.notifications (user_id, actor_id, type, video_id)
      values (v_parent_author, new.author_id, 'fork', new.id);
    end if;
  end if;
  return new;
end; $$;
create trigger on_fork_created after insert on public.videos
  for each row execute function public.notify_on_fork();

-- follow：给被关注者发，actor=关注者
create or replace function public.notify_on_follow()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.notifications (user_id, actor_id, type)
  values (new.followee_id, new.follower_id, 'follow');
  return new;
end; $$;
create trigger on_follow_created after insert on public.follows
  for each row execute function public.notify_on_follow();
