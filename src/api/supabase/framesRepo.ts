import { supabase } from '@/api/client';
import { useAuth } from '@/store/auth';

// 上传续写用的尾帧到 thumbnails/{uid}/{videoId}-tail.jpg，返回公开 URL。
// 豆包不返回视频末帧，客户端用 expo-video-thumbnails 抽帧后经此上传，供续写当首帧。
// 需要迁移 0012_thumbnails_client_write 授予客户端写权限。
export async function uploadTailFrame(localUri: string, sourceVideoId: string): Promise<string> {
  const uid = useAuth.getState().user?.id;
  if (!uid) throw new Error('未登录');
  const res = await fetch(localUri);
  const blob = await res.arrayBuffer();
  const path = `${uid}/${sourceVideoId}-tail.jpg`;
  const { error } = await supabase().storage.from('thumbnails')
    .upload(path, new Uint8Array(blob), { contentType: 'image/jpeg', upsert: true });
  if (error) throw error;
  const { data } = supabase().storage.from('thumbnails').getPublicUrl(path);
  return data.publicUrl;
}
