import { supabase } from '@/api/client';
import { useAuth } from '@/store/auth';

// 上传续写用的尾帧到 thumbnails/{uid}/{sourceVideoId}-{uniq}-tail.jpg，返回公开 URL。
// 豆包不返回视频末帧，客户端用 expo-video-thumbnails 抽帧后经此上传，供续写当首帧。
// 需要迁移 0012_thumbnails_client_write 授予客户端写权限。
//
// ⚠️ 路径必须带唯一后缀 uniq：对同一父视频续写多次时，若都写到同一路径，
// 豆包按 URL 抓图会命中 CDN/缓存导致「串帧」——第二次续写拿到第一次的图。
// 每次续写用独立文件名，URL 唯一，彻底避免。
export async function uploadTailFrame(localUri: string, sourceVideoId: string, uniq: string): Promise<string> {
  const uid = useAuth.getState().user?.id;
  if (!uid) throw new Error('未登录');
  const res = await fetch(localUri);
  const blob = await res.arrayBuffer();
  const path = `${uid}/${sourceVideoId}-${uniq}-tail.jpg`;
  const { error } = await supabase().storage.from('thumbnails')
    .upload(path, new Uint8Array(blob), { contentType: 'image/jpeg', upsert: true });
  if (error) throw error;
  const { data } = supabase().storage.from('thumbnails').getPublicUrl(path);
  return data.publicUrl;
}
