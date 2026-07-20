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

// 续写祖先链：从叶子沿 parent_id 回溯到根，返回 root→leaf 顺序的可播放片段。
// 用于详情页连贯播放（每段视频只是 5s 片段，拼起来才是完整故事）。
export interface ChainClip {
  id: string;
  videoUrl: string;
  durationMs: number | null;
  prompt: string | null;
}

export async function getContinuationChainRows(leafId: string): Promise<ChainClip[]> {
  // 先拿 leaf 的 root_id
  const { data: leaf, error: leafErr } = await supabase()
    .from('videos').select('root_id').eq('id', leafId).maybeSingle();
  if (leafErr) throw leafErr;
  if (!leaf) return [];
  // 查同一棵树的全部节点（只取拼接需要的字段）
  const { data, error } = await supabase()
    .from('videos')
    .select('id,parent_id,video_url,duration_ms,prompt,status')
    .eq('root_id', (leaf as { root_id: string }).root_id);
  if (error) throw error;
  return buildChain(leafId, (data ?? []) as ChainNode[]);
}

interface ChainNode {
  id: string;
  parent_id: string | null;
  video_url: string;
  duration_ms: number | null;
  prompt: string | null;
  status: string;
}

// 从 leaf 沿 parent_id 回溯到根，反转成 root→leaf，过滤掉未就绪/空 URL 的片段。
// 导出供本地保底路径复用。
export function buildChain(leafId: string, nodes: ChainNode[]): ChainClip[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const chain: ChainNode[] = [];
  const seen = new Set<string>(); // 防御父子成环导致死循环
  let cur = byId.get(leafId);
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    chain.push(cur);
    cur = cur.parent_id ? byId.get(cur.parent_id) : undefined;
  }
  chain.reverse(); // root → leaf
  return chain
    .filter((n) => n.status === 'ready' && n.video_url)
    .map((n) => ({ id: n.id, videoUrl: n.video_url, durationMs: n.duration_ms, prompt: n.prompt }));
}

export async function getVersionTreeRows(rootId: string): Promise<VersionNode[]> {
  const { data, error } = await supabase()
    .from('videos').select('id,parent_id,root_id,remix_kind,depth,prompt,thumbnail_url,created_at,author:profiles!videos_author_id_fkey(username,avatar_url)')
    .eq('root_id', rootId);
  if (error) throw error;
  return (data ?? [])
    .map((r: any) => ({
      id: r.id, parent_id: r.parent_id, root_id: r.root_id,
      remix_kind: r.remix_kind, depth: r.depth, prompt: r.prompt,
      author_username: r.author?.username ?? null,
      author_avatar_url: r.author?.avatar_url ?? null,
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

