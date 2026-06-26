-- 0004_async_generation.sql
-- 异步两段式生成：videos 表加 doubao_task_id，记录豆包任务 id 供 poll 查询。
-- 同步模式撞 Edge Function 墙钟上限(WallClockTime kill,连退款都来不及)，改异步。

alter table public.videos add column if not exists doubao_task_id text;
