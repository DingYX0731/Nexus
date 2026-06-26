-- 0005_comment_replies.sql
-- 评论回复嵌套：comments 表加 parent_id（自引用），支持回复挂在父评论下。

alter table public.comments
  add column if not exists parent_id uuid references public.comments(id) on delete cascade;

create index if not exists comments_parent_idx on public.comments(parent_id);
