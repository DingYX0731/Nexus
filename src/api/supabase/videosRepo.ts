import { supabase } from '@/api/client';
import type { Video, VersionNode } from '@/api/types';
import { useAuth } from '@/store/auth';
import { rowToVideo } from './mappers';
import type { VideoWithStatsRow } from './rows';

const SELECT = '*, author:profiles!videos_author_id_fkey(*)';

function currentUserId(): string | null {
  return useAuth.getState().user?.id ?? null;
}

async function likedSet(userId: string | null, videoIds: string[]): Promise<Set<string>> {
  if (!userId || videoIds.length === 0) return new Set();
  const { data } = await supabase().from('likes').select('video_id')
    .eq('user_id', userId).in('video_id', videoIds);
  return new Set((data ?? []).map((r) => r.video_id as string));
}

function withLiked(videos: Video[], liked: Set<string>): Video[] {
  return videos.map((v) => ({ ...v, is_liked: liked.has(v.id) }));
}

export async function listFeedRows(): Promise<Video[]> {
  const { data, error } = await supabase()
    .from('video_with_stats').select(SELECT)
    .eq('visibility', 'public').eq('status', 'ready').neq('video_url', '').order('created_at', { ascending: false });
  if (error) throw error;
  const videos = (data as VideoWithStatsRow[]).map(rowToVideo);
  return withLiked(videos, await likedSet(currentUserId(), videos.map((v) => v.id)));
}

export async function listMyVideoRows(userId: string | null | undefined): Promise<Video[]> {
  if (!userId) return [];
  const { data, error } = await supabase()
    .from('video_with_stats').select(SELECT)
    .eq('author_id', userId).order('created_at', { ascending: false });
  if (error) throw error;
  // 保留 ready（有 video_url）和 generating（占位行，video_url=''）；过滤掉其他状态（failed 等）
  const videos = (data as VideoWithStatsRow[]).map(rowToVideo)
    .filter((v) => v.status === 'ready' || v.status === 'generating');
  return withLiked(videos, await likedSet(userId, videos.map((v) => v.id)));
}

export async function getVideoRow(id: string): Promise<Video | null> {
  const { data, error } = await supabase()
    .from('video_with_stats').select(SELECT).eq('id', id).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const v = rowToVideo(data as VideoWithStatsRow);
  const liked = await likedSet(currentUserId(), [v.id]);
  return { ...v, is_liked: liked.has(v.id) };
}

export async function listUserPublicVideosRows(userId: string): Promise<Video[]> {
  const { data, error } = await supabase()
    .from('video_with_stats').select(SELECT)
    .eq('author_id', userId).eq('visibility', 'public').eq('status', 'ready')
    .order('created_at', { ascending: false });
  if (error) throw error;
  const videos = (data as VideoWithStatsRow[]).map(rowToVideo);
  return withLiked(videos, await likedSet(currentUserId(), videos.map((v) => v.id)));
}

export async function getVersionTreeRows(rootId: string): Promise<VersionNode[]> {
  const { data, error } = await supabase()
    .from('videos').select('id,parent_id,root_id,remix_kind,depth,prompt,thumbnail_url,created_at,author:profiles!videos_author_id_fkey(username)')
    .eq('root_id', rootId);
  if (error) throw error;
  return (data ?? [])
    .map((r: any) => ({
      id: r.id, parent_id: r.parent_id, root_id: r.root_id,
      remix_kind: r.remix_kind, depth: r.depth, prompt: r.prompt,
      author_username: r.author?.username ?? null,
      thumbnail_url: r.thumbnail_url, created_at: r.created_at,
    }))
    .sort((a, b) => a.depth - b.depth || a.created_at.localeCompare(b.created_at));
}

export async function toggleLikeRemote(videoId: string, userId: string | null): Promise<boolean> {
  if (!userId) return false;
  const { data: existing } = await supabase().from('likes')
    .select('video_id').eq('user_id', userId).eq('video_id', videoId).maybeSingle();
  if (existing) {
    await supabase().from('likes').delete().eq('user_id', userId).eq('video_id', videoId);
    return false;
  }
  await supabase().from('likes').insert({ user_id: userId, video_id: videoId });
  return true;
}

export async function recordPlayRemote(videoId: string): Promise<void> {
  // 用 SECURITY DEFINER rpc 原子自增：绕过 RLS(可计他人公开视频)，且 +1 原子无并发丢失。
  await supabase().rpc('increment_play_count', { p_video_id: videoId });
}

export async function setVisibilityRemote(id: string, vis: 'public' | 'private'): Promise<void> {
  const { error } = await supabase().from('videos').update({ visibility: vis }).eq('id', id);
  if (error) throw error;
}

export async function deleteVideoRemote(id: string): Promise<void> {
  const { error } = await supabase().from('videos').delete().eq('id', id);
  if (error) throw error;
}

export async function listLikedVideosRows(userId: string): Promise<Video[]> {
  // 先查该用户点赞的 video_id 列表，再从 video_with_stats 拉完整数据
  const { data: likeRows, error: likeErr } = await supabase()
    .from('likes').select('video_id').eq('user_id', userId);
  if (likeErr) throw likeErr;
  const ids = (likeRows ?? []).map((r: { video_id: string }) => r.video_id);
  if (ids.length === 0) return [];
  const { data, error } = await supabase()
    .from('video_with_stats').select(SELECT)
    .in('id', ids).eq('status', 'ready')
    // 隐私：只显示公开的 + 自己的（视图不继承底表 RLS，须显式过滤，防点赞列表泄露他人已转私密的视频）
    .or(`visibility.eq.public,author_id.eq.${userId}`)
    .order('created_at', { ascending: false });
  if (error) throw error;
  const videos = (data as VideoWithStatsRow[]).map(rowToVideo);
  return withLiked(videos, await likedSet(currentUserId(), videos.map((v) => v.id)));
}

export async function listForkedVideosRows(userId: string): Promise<Video[]> {
  // 先查该用户自己的视频 ids
  const { data: myRows, error: myErr } = await supabase()
    .from('videos').select('id').eq('author_id', userId);
  if (myErr) throw myErr;
  const myIds = (myRows ?? []).map((r: { id: string }) => r.id);
  if (myIds.length === 0) return [];
  // 再查 parent_id in myIds 且 author_id != userId（别人续写/remix 的作品）且 status=ready
  // 隐私：只显示别人公开的续写作品（视图不继承底表 RLS，须显式过滤）
  const { data, error } = await supabase()
    .from('video_with_stats').select(SELECT)
    .in('parent_id', myIds).eq('status', 'ready').neq('author_id', userId)
    .eq('visibility', 'public')
    .order('created_at', { ascending: false });
  if (error) throw error;
  const videos = (data as VideoWithStatsRow[]).map(rowToVideo);
  return withLiked(videos, await likedSet(currentUserId(), videos.map((v) => v.id)));
}

// publishEdit 用：不调 AI，直接插一行（复制父视频 URL + editMetadata）
export interface InsertVideoInput {
  authorId: string;
  prompt: string;
  parentId: string | null;
  rootId: string;
  depth: number;
  remixKind: string | null;
  videoUrl: string;
  thumbnailUrl: string | null;
  tailFrameUrl: string | null;
  durationMs: number | null;
  width: number | null;
  height: number | null;
  aiProvider: string | null;
  editMetadata: unknown | null;
  visibility?: 'public' | 'private';
}

export async function insertVideoRow(input: InsertVideoInput): Promise<Video> {
  const { data, error } = await supabase().from('videos').insert({
    author_id: input.authorId,
    parent_id: input.parentId,
    root_id: input.rootId,
    depth: input.depth,
    remix_kind: input.remixKind,
    prompt: input.prompt,
    video_url: input.videoUrl,
    thumbnail_url: input.thumbnailUrl,
    tail_frame_url: input.tailFrameUrl,
    duration_ms: input.durationMs,
    width: input.width,
    height: input.height,
    ai_provider: input.aiProvider,
    edit_metadata: input.editMetadata,
    status: 'ready',
    visibility: input.visibility ?? 'public',
  }).select('id').single();
  if (error) throw error;
  const created = await getVideoRow((data as { id: string }).id);
  if (!created) throw new Error('插入后读取失败');
  return created;
}
