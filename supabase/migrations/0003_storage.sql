insert into storage.buckets (id, name, public) values ('videos', 'videos', true) on conflict do nothing;
insert into storage.buckets (id, name, public) values ('thumbnails', 'thumbnails', true) on conflict do nothing;

-- 公开读
create policy "videos_public_read" on storage.objects
  for select using (bucket_id = 'videos');
create policy "thumbs_public_read" on storage.objects
  for select using (bucket_id = 'thumbnails');
