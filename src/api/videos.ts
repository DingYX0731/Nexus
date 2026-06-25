import type { EditMetadata, VersionNode, Video } from './types';
import { useLocalVideos, makeNewVideo } from '@/store/videos';
import { useAuth } from '@/store/auth';
import { defaultProvider } from '@/ai/VideoGenProvider';
import { hasSupabase } from '@/api/client';
import * as repo from '@/api/supabase/videosRepo';
import * as commentsRepo from '@/api/supabase/commentsRepo';
import { callGenerate } from '@/api/supabase/generateClient';

export type { Video, VersionNode } from './types';

function snapshot() {
  return useLocalVideos.getState();
}
function authSnapshot() {
  return useAuth.getState();
}

async function waitForJob(jobId: string, opts: { timeoutMs?: number; onProgress?: (status: string) => void } = {}): Promise<{
  videoUrl: string; thumbnailUrl?: string; tailFrameUrl?: string;
  durationMs?: number; width?: number; height?: number;
}> {
  // 豆包 / Kling 等真实 provider 通常 1-3 分钟,默认 4 分钟超时;Mock 走默认值也够。
  const timeoutMs = opts.timeoutMs ?? 240_000;
  const start = new Date().getTime();
  let pollInterval = 1500; // 起步快,后面变慢避免轰炸 API
  while (true) {
    const job = await defaultProvider.getJob(jobId);
    opts.onProgress?.(job.status);
    if (job.status === 'succeeded' && job.videoUrl) {
      return {
        videoUrl: job.videoUrl,
        thumbnailUrl: job.thumbnailUrl,
        tailFrameUrl: job.tailFrameUrl,
        durationMs: job.durationMs,
        width: job.width,
        height: job.height,
      };
    }
    if (job.status === 'failed') throw new Error(job.error ?? 'AI 生成失败');
    if (new Date().getTime() - start > timeoutMs) throw new Error('生成超时,请稍后重试');
    await new Promise((r) => setTimeout(r, pollInterval));
    // 1.5s → 3s → 5s 渐进
    pollInterval = Math.min(pollInterval + 1500, 5000);
  }
}

function authorOfNew(): { id: string | null; username: string } {
  const { user, isAnonymous } = authSnapshot();
  if (isAnonymous || !user) return { id: null, username: '匿名用户' };
  return { id: user.id, username: user.username };
}

export async function listFeed(): Promise<Video[]> {
  if (hasSupabase) return repo.listFeedRows();
  snapshot().hydrate();
  return [...snapshot().videos].sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export async function listMyVideos(userId: string | null | undefined): Promise<Video[]> {
  if (hasSupabase) return repo.listMyVideoRows(userId);
  snapshot().hydrate();
  if (!userId) return [];
  return snapshot().videos.filter((v) => v.author_id === userId);
}

export async function getVideo(id: string): Promise<Video | null> {
  if (hasSupabase) return repo.getVideoRow(id);
  snapshot().hydrate();
  return snapshot().videos.find((v) => v.id === id) ?? null;
}

export async function getVersionTree(rootId: string): Promise<VersionNode[]> {
  if (hasSupabase) return repo.getVersionTreeRows(rootId);
  snapshot().hydrate();
  const all = snapshot().videos.filter((v) => v.root_id === rootId);
  return all
    .map((v) => ({
      id: v.id,
      parent_id: v.parent_id,
      root_id: v.root_id,
      remix_kind: v.remix_kind,
      depth: v.depth,
      prompt: v.prompt,
      author_username: v.author?.username ?? null,
      thumbnail_url: v.thumbnail_url ?? null,
      created_at: v.created_at,
    }))
    .sort((a, b) => a.depth - b.depth || a.created_at.localeCompare(b.created_at));
}

export async function generateVideo(input: {
  prompt: string;
  aspect?: '9:16' | '16:9';
  onProgress?: (status: string) => void;
}): Promise<Video> {
  if (hasSupabase) {
    input.onProgress?.('running');
    return callGenerate({ kind: 'text', prompt: input.prompt, aspect: input.aspect });
  }
  const { jobId } = await defaultProvider.textToVideo({ prompt: input.prompt, aspect: input.aspect });
  const result = await waitForJob(jobId, { onProgress: input.onProgress });
  const author = authorOfNew();
  const video = makeNewVideo({
    authorId: author.id,
    authorUsername: author.username,
    prompt: input.prompt,
    aiProvider: defaultProvider.name,
    ...result,
  });
  snapshot().addVideo(video);
  return video;
}

export async function continueVideo(input: { parentId: string; prompt: string }): Promise<Video> {
  if (hasSupabase) {
    const parent = await getVideo(input.parentId);
    if (!parent) throw new Error('源视频未找到');
    return callGenerate({
      kind: 'continuation',
      prompt: input.prompt,
      parentId: input.parentId,
      parentTailFrameUrl: parent.tail_frame_url ?? undefined,
    });
  }
  const parent = await getVideo(input.parentId);
  if (!parent) throw new Error('源视频未找到');
  if (!parent.tail_frame_url) throw new Error('源视频缺少尾帧,无法续写');
  const { jobId } = await defaultProvider.imageToVideo({
    imageUrl: parent.tail_frame_url,
    prompt: input.prompt,
  });
  const result = await waitForJob(jobId);
  const author = authorOfNew();
  const video = makeNewVideo({
    authorId: author.id,
    authorUsername: author.username,
    prompt: input.prompt,
    parent,
    remixKind: 'continuation',
    aiProvider: defaultProvider.name,
    ...result,
  });
  snapshot().addVideo(video);
  snapshot().bumpStat(parent.id, 'fork_count');
  return video;
}

export async function remixVideo(input: { parentId: string; prompt: string }): Promise<Video> {
  if (hasSupabase) {
    return callGenerate({ kind: 'remix', prompt: input.prompt, parentId: input.parentId });
  }
  const parent = await getVideo(input.parentId);
  if (!parent) throw new Error('源视频未找到');
  const { jobId } = await defaultProvider.textToVideo({ prompt: input.prompt });
  const result = await waitForJob(jobId);
  const author = authorOfNew();
  const video = makeNewVideo({
    authorId: author.id,
    authorUsername: author.username,
    prompt: input.prompt,
    parent,
    remixKind: 'prompt_remix',
    aiProvider: defaultProvider.name,
    ...result,
  });
  snapshot().addVideo(video);
  snapshot().bumpStat(parent.id, 'fork_count');
  return video;
}

export async function publishEdit(input: { parentId: string; editMetadata: EditMetadata }): Promise<Video> {
  if (hasSupabase) {
    const parent = await getVideo(input.parentId);
    if (!parent) throw new Error('源视频未找到');
    const author = authorOfNew();
    if (!author.id) throw new Error('请先登录再发布编辑');
    return repo.insertVideoRow({
      authorId: author.id,
      prompt: parent.prompt,
      parentId: parent.id,
      rootId: parent.root_id,
      depth: parent.depth + 1,
      remixKind: 'edit',
      videoUrl: parent.video_url,
      thumbnailUrl: parent.thumbnail_url ?? null,
      tailFrameUrl: parent.tail_frame_url ?? null,
      durationMs: parent.duration_ms ?? null,
      width: parent.width ?? null,
      height: parent.height ?? null,
      aiProvider: parent.ai_provider ?? null,
      editMetadata: input.editMetadata,
      visibility: 'public',
    });
  }
  const parent = await getVideo(input.parentId);
  if (!parent) throw new Error('源视频未找到');
  const author = authorOfNew();
  const video = makeNewVideo({
    authorId: author.id,
    authorUsername: author.username,
    prompt: parent.prompt,
    parent,
    remixKind: 'edit',
    videoUrl: parent.video_url,
    thumbnailUrl: parent.thumbnail_url ?? undefined,
    tailFrameUrl: parent.tail_frame_url ?? undefined,
    durationMs: parent.duration_ms ?? undefined,
    width: parent.width ?? undefined,
    height: parent.height ?? undefined,
    aiProvider: parent.ai_provider ?? undefined,
    editMetadata: input.editMetadata,
  });
  snapshot().addVideo(video);
  snapshot().bumpStat(parent.id, 'fork_count');
  return video;
}

export async function toggleLike(videoId: string, userId: string | null): Promise<boolean> {
  if (hasSupabase) return repo.toggleLikeRemote(videoId, userId);
  return snapshot().toggleLike(videoId, userId);
}

export async function recordPlay(videoId: string): Promise<void> {
  if (hasSupabase) return repo.recordPlayRemote(videoId);
  snapshot().bumpStat(videoId, 'play_count');
}
