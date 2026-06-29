import { supabase } from '@/api/client';
import { useAuth } from '@/store/auth';

export interface ProfileData {
  id: string;
  username: string;
  avatar_url: string | null;
  bio: string | null;
}

export class UsernameTakenError extends Error {
  code = 'username_taken' as const;
  constructor() { super('用户名已被占用'); this.name = 'UsernameTakenError'; }
}

export async function getProfile(userId: string): Promise<ProfileData | null> {
  const { data, error } = await supabase()
    .from('profiles').select('id,username,avatar_url,bio').eq('id', userId).maybeSingle();
  if (error) throw error;
  return (data as ProfileData | null) ?? null;
}

export async function updateProfile(input: { username?: string; avatarUrl?: string; bio?: string }): Promise<void> {
  const uid = useAuth.getState().user?.id;
  if (!uid) throw new Error('未登录');
  const patch: Record<string, unknown> = {};
  if (input.username !== undefined) patch.username = input.username;
  if (input.avatarUrl !== undefined) patch.avatar_url = input.avatarUrl;
  if (input.bio !== undefined) patch.bio = input.bio;
  const { error } = await supabase().from('profiles').update(patch).eq('id', uid);
  if (error) {
    // Postgres unique violation code 23505
    if ((error as any).code === '23505') throw new UsernameTakenError();
    throw error;
  }
}

// 上传头像到 avatars/{uid}/avatar.jpg，返回带 cache-buster 的 publicUrl
export async function uploadAvatar(localUri: string): Promise<string> {
  const uid = useAuth.getState().user?.id;
  if (!uid) throw new Error('未登录');
  const res = await fetch(localUri);
  const blob = await res.arrayBuffer();
  const path = `${uid}/avatar.jpg`;
  const { error } = await supabase().storage.from('avatars')
    .upload(path, new Uint8Array(blob), { contentType: 'image/jpeg', upsert: true });
  if (error) throw error;
  const { data } = supabase().storage.from('avatars').getPublicUrl(path);
  // upsert 覆盖同名文件，加 cache-buster 让客户端拉新图
  return `${data.publicUrl}?t=${Date.now()}`;
}
