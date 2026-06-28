-- 0011_profile_bio_avatars.sql
-- 资料编辑：profiles 加 bio 列 + avatars Storage bucket。

alter table public.profiles add column if not exists bio text;

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true) on conflict do nothing;

-- 公开读
create policy "avatars_public_read" on storage.objects
  for select using (bucket_id = 'avatars');

-- 只能写/改/删自己目录({uid}/...)下的文件：路径第一段必须等于 auth.uid()
create policy "avatars_insert_own" on storage.objects
  for insert with check (
    bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy "avatars_update_own" on storage.objects
  for update using (
    bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text
  );
