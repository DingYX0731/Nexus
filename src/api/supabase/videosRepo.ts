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

export async function getContinuationChainRows(videoId: string): Promise<ChainClip[]> {
  // 先拿当前视频的 root_id
  const { data: cur, error: curErr } = await supabase()
    .from('videos').select('root_id').eq('id', videoId).maybeSingle();
  if (curErr) throw curErr;
  if (!cur) return [];
  // 查同一棵树的全部节点（只取拼接需要的字段）
  const { data, error } = await supabase()
    .from('videos')
    .select('id,parent_id,video_url,duration_ms,prompt,status,created_at')
    .eq('root_id', (cur as { root_id: string }).root_id);
  if (error) throw error;
  return buildChain(videoId, (data ?? []) as ChainNode[]);
}

interface ChainNode {
  id: string;
  parent_id: string | null;
  video_url: string;
  duration_ms: number | null;
  prompt: string | null;
  status: string;
  created_at: string;
}

// 构造续写连播链 = 从「当前节点」沿 parent_id 回溯到根，反转成 root→当前节点。
// 只包含到当前这一集为止的祖先路径，绝不钻进任何子分支——
// 这样点第 2 集就播到第 2 集，不会自动跑到它的第 3 集，也不会串到别的分支。
// 步道条(整棵树/分支)由 getSeriesTree 单独提供，与这里的连播链无关。
// 导出供本地保底路径复用。
export function buildChain(videoId: string, nodes: ChainNode[]): ChainClip[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const path: ChainNode[] = [];
  const seen = new Set<string>(); // 防父子成环死循环
  let node = byId.get(videoId);
  while (node && !seen.has(node.id)) {
    seen.add(node.id);
    path.push(node);
    node = node.parent_id ? byId.get(node.parent_id) : undefined;
  }
  path.reverse(); // root → 当前节点
  return path
    .filter((n) => n.status === 'ready' && n.video_url)
    .map((n) => ({ id: n.id, videoUrl: n.video_url, durationMs: n.duration_ms, prompt: n.prompt }));
}

// 续写系列树：返回整棵树的 ready 节点（含所有分支），供步道条按父子关系渲染。
// 与 getContinuationChain（只出主线连播）不同，这里保留分支。
export interface SeriesNode {
  id: string;
  parentId: string | null;
  depth: number;
  prompt: string | null;
  createdAt: string;
}

export async function getSeriesTreeRows(videoId: string): Promise<SeriesNode[]> {
  const { data: cur, error: curErr } = await supabase()
    .from('videos').select('root_id').eq('id', videoId).maybeSingle();
  if (curErr) throw curErr;
  if (!cur) return [];
  const { data, error } = await supabase()
    .from('videos')
    .select('id,parent_id,depth,prompt,status,video_url,created_at')
    .eq('root_id', (cur as { root_id: string }).root_id);
  if (error) throw error;
  return normalizeSeriesNodes((data ?? []) as any[]);
}

// 过滤出 ready 且有 video_url 的节点，按 depth→created_at 排序，导出供本地保底复用。
export function normalizeSeriesNodes(rows: any[]): SeriesNode[] {
  return rows
    .filter((r) => r.status === 'ready' && r.video_url)
    .map((r) => ({
      id: r.id,
      parentId: r.parent_id ?? null,
      depth: r.depth ?? 0,
      prompt: r.prompt ?? null,
      createdAt: r.created_at,
    }))
    .sort((a, b) => a.depth - b.depth || a.createdAt.localeCompare(b.createdAt));
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

// 删除视频 = 删「当前节点 + 其所有后代分支」，不影响祖先与兄弟分支。
// parent_id 外键是 on delete set null，直接删单条会把子节点变成孤立根，所以要先算出整个子树再一起删。
export async function deleteVideoRemote(id: string): Promise<void> {
  // 拿当前节点的 root_id，取整棵树
  const { data: cur } = await supabase()
    .from('videos').select('root_id').eq('id', id).maybeSingle();
  const rootId = (cur as { root_id: string } | null)?.root_id;
  let idsToDelete = [id];
  if (rootId) {
    const { data: nodes } = await supabase()
      .from('videos').select('id,parent_id').eq('root_id', rootId);
    idsToDelete = collectSubtreeIds(id, (nodes ?? []) as { id: string; parent_id: string | null }[]);
  }
  const { error } = await supabase().from('videos').delete().in('id', idsToDelete);
  if (error) throw error;
}

// 收集以 rootId 为根的子树内所有节点 id（含自己）。导出供本地保底复用。
export function collectSubtreeIds(
  rootId: string,
  nodes: { id: string; parent_id: string | null }[],
): string[] {
  const childrenByParent = new Map<string, string[]>();
  for (const n of nodes) {
    if (!n.parent_id) continue;
    const arr = childrenByParent.get(n.parent_id) ?? [];
    arr.push(n.id);
    childrenByParent.set(n.parent_id, arr);
  }
  const result: string[] = [];
  const stack = [rootId];
  const seen = new Set<string>();
  while (stack.length) {
    const cur = stack.pop()!;
    if (seen.has(cur)) continue; // 防环
    seen.add(cur);
    result.push(cur);
    for (const child of childrenByParent.get(cur) ?? []) stack.push(child);
  }
  return result;
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

