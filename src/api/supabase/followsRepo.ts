import { supabase } from '@/api/client';
import { useAuth } from '@/store/auth';

function currentUserId(): string | null {
  return useAuth.getState().user?.id ?? null;
}

export async function followUser(followeeId: string): Promise<void> {
  const uid = currentUserId();
  if (!uid) throw new Error('未登录');
  const { error } = await supabase().from('follows').insert({ follower_id: uid, followee_id: followeeId });
  if (error) throw error;
}

export async function unfollowUser(followeeId: string): Promise<void> {
  const uid = currentUserId();
  if (!uid) throw new Error('未登录');
  const { error } = await supabase().from('follows')
    .delete().eq('follower_id', uid).eq('followee_id', followeeId);
  if (error) throw error;
}

export async function isFollowing(followeeId: string): Promise<boolean> {
  const uid = currentUserId();
  if (!uid) return false;
  const { data } = await supabase().from('follows')
    .select('follower_id').eq('follower_id', uid).eq('followee_id', followeeId).maybeSingle();
  return !!data;
}

export async function getFollowCounts(userId: string): Promise<{ followers: number; following: number }> {
  const [followersRes, followingRes] = await Promise.all([
    supabase().from('follows').select('*', { count: 'exact', head: true }).eq('followee_id', userId),
    supabase().from('follows').select('*', { count: 'exact', head: true }).eq('follower_id', userId),
  ]);
  return { followers: followersRes.count ?? 0, following: followingRes.count ?? 0 };
}

export interface UserSummary {
  id: string;
  username: string;
  avatar_url: string | null;
}

export async function listFollowing(userId: string): Promise<UserSummary[]> {
  const { data, error } = await supabase()
    .from('follows')
    .select('followee:profiles!follows_followee_id_fkey(id,username,avatar_url)')
    .eq('follower_id', userId);
  if (error) throw error;
  return (data ?? [])
    .map((r: any) => r.followee)
    .filter(Boolean) as UserSummary[];
}

export async function listFollowers(userId: string): Promise<UserSummary[]> {
  const { data, error } = await supabase()
    .from('follows')
    .select('follower:profiles!follows_follower_id_fkey(id,username,avatar_url)')
    .eq('followee_id', userId);
  if (error) throw error;
  return (data ?? [])
    .map((r: any) => r.follower)
    .filter(Boolean) as UserSummary[];
}
