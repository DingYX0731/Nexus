-- 0012_thumbnails_client_write.sql
-- 续写尾帧：允许客户端把抽取的视频末帧上传到 thumbnails bucket 自己的目录下。
-- 豆包不返回视频末帧，客户端用 expo-video-thumbnails 抽帧后上传，供续写当首帧。
-- 路径约定 {uid}/...，第一段必须等于 auth.uid()（与 avatars 一致）。

create policy "thumbs_insert_own" on storage.objects
  for insert with check (
    bucket_id = 'thumbnails' and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy "thumbs_update_own" on storage.objects
  for update using (
    bucket_id = 'thumbnails' and (storage.foldername(name))[1] = auth.uid()::text
  );
