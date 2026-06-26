-- 0006_comment_reply_to.sql
-- 评论回复指向：记录"被直接回复者"的显示名，用于 UI 显示「↳ 回复 @某人」。
-- parent_id 仍归一到根评论(两层楼结构);reply_to_name 记录楼内实际回复对象,避免多层回复时分不清回谁。

alter table public.comments
  add column if not exists reply_to_name text;
