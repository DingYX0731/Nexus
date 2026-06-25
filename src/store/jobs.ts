// AI 任务状态机。
//
// 设计要点:
// - 用户点击"生成"后立即返回(不阻塞 UI),任务进入后台
// - 任务列表显示在 Create 页,实时反映进度
// - 任务完成后:videos store 自动接收新视频,并触发本地 "刚完成" 标记
// - 应用切到后台不影响轮询(MVP 阶段);M3 会迁到 Edge Function + Realtime
import { create } from 'zustand';
import { router } from 'expo-router';
import type { EditMetadata, Video } from '@/api/types';
import { defaultProvider } from '@/ai/VideoGenProvider';
import { useLocalVideos, makeNewVideo } from './videos';
import { useAuth } from './auth';
import { useCredits } from './credits';
import { showToast } from '@/components/toast/Toast';

export type JobKind = 'text_to_video' | 'continuation' | 'prompt_remix' | 'edit_publish';
export type JobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';

export interface AiJobRecord {
  id: string;                // local uuid
  externalJobId?: string;    // doubao/kling task id
  ownerUserId: string;       // 本地隔离;匿名用户走 anon
  ownerUsername: string;     // 提交时的快照,登出后仍能正确归属作者
  kind: JobKind;
  promptSummary: string;     // 用于卡片显示
  aspect?: '9:16' | '16:9';
  parentVideoId?: string;
  status: JobStatus;
  statusMsg: string;         // "排队中" / "正在生成" / 错误信息
  createdAt: number;
  finishedAt?: number;
  finishedVideoId?: string;  // 完成后跳详情用
  editMetadata?: EditMetadata;
}

interface JobsStore {
  jobs: AiJobRecord[];
  add: (r: AiJobRecord) => void;
  patch: (id: string, patch: Partial<AiJobRecord>) => void;
  cancel: (id: string) => void;
  visibleFor: (userId: string) => AiJobRecord[];
}

const useJobsStoreInternal = create<JobsStore>((set, get) => ({
  jobs: [],
  add: (r) => set((s) => ({ jobs: [r, ...s.jobs] })),
  patch: (id, patch) => set((s) => ({
    jobs: s.jobs.map((j) => (j.id === id ? { ...j, ...patch } : j)),
  })),
  cancel: (id) => set((s) => ({
    jobs: s.jobs.map((j) => (j.id === id && (j.status === 'queued' || j.status === 'running')
      ? { ...j, status: 'cancelled' as const, statusMsg: '已取消' }
      : j)),
  })),
  visibleFor: (userId) =>
    get().jobs.filter((j) => j.ownerUserId === userId).slice(0, 20),
}));

export const useJobs = useJobsStoreInternal;

function newId() {
  return `job_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function statusToMsg(s: string): string {
  switch (s) {
    case 'queued': return '排队中...';
    case 'running': return '正在生成,请稍候...';
    case 'succeeded': return '完成';
    case 'failed': return '失败';
    case 'cancelled': return '已取消';
    default: return s;
  }
}

interface SubmitTextOptions {
  prompt: string;
  aspect?: '9:16' | '16:9';
}
interface SubmitContinuationOptions {
  parentVideo: Video;
  prompt: string;
}
interface SubmitRemixOptions {
  parentVideo: Video;
  prompt: string;
}
interface SubmitEditOptions {
  parentVideo: Video;
  editMetadata: EditMetadata;
}

function authorOfNew(): { id: string; username: string } {
  const { user, isAnonymous } = useAuth.getState();
  if (isAnonymous || !user) return { id: 'anon', username: '匿名用户' };
  return { id: user.id, username: user.username };
}

async function runProviderText(rec: AiJobRecord, prompt: string) {
  useJobsStoreInternal.getState().patch(rec.id, { statusMsg: '提交任务到 AI Provider...' });
  const { jobId: externalJobId } = await defaultProvider.textToVideo({
    prompt,
    aspect: rec.aspect,
    durationSec: 5,
  });
  useJobsStoreInternal.getState().patch(rec.id, { externalJobId });
  return externalJobId;
}

async function runProviderImage(rec: AiJobRecord, imageUrl: string, prompt: string) {
  useJobsStoreInternal.getState().patch(rec.id, { statusMsg: '提交任务到 AI Provider...' });
  const { jobId: externalJobId } = await defaultProvider.imageToVideo({
    imageUrl,
    prompt,
    durationSec: 5,
  });
  useJobsStoreInternal.getState().patch(rec.id, { externalJobId });
  return externalJobId;
}

async function pollUntilDone(rec: AiJobRecord, externalJobId: string): Promise<{
  videoUrl: string; thumbnailUrl?: string; tailFrameUrl?: string;
  durationMs?: number; width?: number; height?: number;
}> {
  const start = Date.now();
  const TIMEOUT = 5 * 60 * 1000;
  let interval = 1500;
  let consecutiveFailures = 0;
  const MAX_CONSECUTIVE_FAILURES = 3;

  while (true) {
    // cancel guard #1:循环顶部
    const cur = useJobsStoreInternal.getState().jobs.find((j) => j.id === rec.id);
    if (!cur || cur.status === 'cancelled') throw new Error('cancelled');

    let job;
    try {
      job = await defaultProvider.getJob(externalJobId);
      consecutiveFailures = 0;
    } catch (netErr: any) {
      // 网络抖动:连续 3 次失败才放弃,期间 sleep 后重试
      consecutiveFailures += 1;
      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        throw new Error(netErr?.message ?? '网络异常,请稍后重试');
      }
      useJobsStoreInternal.getState().patch(rec.id, {
        statusMsg: `网络波动,重试中 (${consecutiveFailures}/${MAX_CONSECUTIVE_FAILURES})`,
      });
      await new Promise((r) => setTimeout(r, 3000));
      continue;
    }

    // cancel guard #2:patch 之前再查一次,防止把 cancelled 覆盖回 running
    const stillThere = useJobsStoreInternal.getState().jobs.find((j) => j.id === rec.id);
    if (!stillThere || stillThere.status === 'cancelled') throw new Error('cancelled');

    useJobsStoreInternal.getState().patch(rec.id, {
      status: job.status === 'succeeded' ? 'running' : job.status,
      statusMsg: statusToMsg(job.status),
    });
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
    if (job.status === 'failed') throw new Error(job.error ?? '生成失败');
    if (Date.now() - start > TIMEOUT) throw new Error('生成超时');
    await new Promise((r) => setTimeout(r, interval));
    interval = Math.min(interval + 1500, 5000);
  }
}

function finalize(rec: AiJobRecord, result: {
  videoUrl: string; thumbnailUrl?: string; tailFrameUrl?: string;
  durationMs?: number; width?: number; height?: number;
}, parent?: Video, editMetadata?: EditMetadata) {
  // cancel guard #3:即使 poll 已经返回 succeeded,中间可能用户已经 cancel 了
  const cur = useJobsStoreInternal.getState().jobs.find((j) => j.id === rec.id);
  if (!cur || cur.status === 'cancelled') return;

  const remixKind = rec.kind === 'continuation' ? 'continuation' :
    rec.kind === 'prompt_remix' ? 'prompt_remix' :
    rec.kind === 'edit_publish' ? 'edit' : undefined;
  const video = makeNewVideo({
    authorId: rec.ownerUserId === 'anon' ? null : rec.ownerUserId,
    authorUsername: rec.ownerUsername, // 用提交时快照,不读当前登录态
    prompt: rec.promptSummary,
    parent,
    remixKind,
    aiProvider: defaultProvider.name,
    editMetadata,
    ...result,
  });
  useLocalVideos.getState().addVideo(video);
  if (parent) useLocalVideos.getState().bumpStat(parent.id, 'fork_count');
  useJobsStoreInternal.getState().patch(rec.id, {
    status: 'succeeded',
    statusMsg: '完成',
    finishedAt: Date.now(),
    finishedVideoId: video.id,
  });
  // 完成提示:用户可能已经切到其他 tab,toast 让 ta 不错过
  showToast({
    message: '你的视频已生成',
    actionLabel: '查看',
    onAction: () => router.push(`/video/${video.id}`),
  });
}

function fail(rec: AiJobRecord, err: any) {
  const wasCancelled = err?.message === 'cancelled';
  const msg = wasCancelled ? '已取消' : (err?.message ?? '生成失败');
  useJobsStoreInternal.getState().patch(rec.id, {
    status: wasCancelled ? 'cancelled' : 'failed',
    statusMsg: msg,
    finishedAt: Date.now(),
  });
  // 失败/取消都退还额度。剪辑发布走 submitEditPublish,不进这个路径。
  if (rec.ownerUserId !== 'anon' && rec.kind !== 'edit_publish') {
    useCredits.getState().refund(rec.ownerUserId);
  }
  if (!wasCancelled) {
    showToast({ message: `生成失败:${msg}`, durationMs: 4000 });
  }
}

// 公开 API
export async function submitTextToVideo(opts: SubmitTextOptions): Promise<AiJobRecord> {
  const author = authorOfNew();
  const rec: AiJobRecord = {
    id: newId(),
    ownerUserId: author.id,
    ownerUsername: author.username,
    kind: 'text_to_video',
    promptSummary: opts.prompt,
    aspect: opts.aspect,
    status: 'queued',
    statusMsg: '排队中...',
    createdAt: Date.now(),
  };
  useJobsStoreInternal.getState().add(rec);
  (async () => {
    try {
      const externalJobId = await runProviderText(rec, opts.prompt);
      const result = await pollUntilDone(rec, externalJobId);
      finalize(rec, result);
    } catch (e) {
      fail(rec, e);
    }
  })();
  return rec;
}

export async function submitContinuation(opts: SubmitContinuationOptions): Promise<AiJobRecord> {
  const author = authorOfNew();
  if (!opts.parentVideo.tail_frame_url) throw new Error('源视频缺少尾帧,无法续写');
  const rec: AiJobRecord = {
    id: newId(),
    ownerUserId: author.id,
    ownerUsername: author.username,
    kind: 'continuation',
    promptSummary: opts.prompt,
    parentVideoId: opts.parentVideo.id,
    status: 'queued',
    statusMsg: '排队中...',
    createdAt: Date.now(),
  };
  useJobsStoreInternal.getState().add(rec);
  (async () => {
    try {
      const externalJobId = await runProviderImage(rec, opts.parentVideo.tail_frame_url!, opts.prompt);
      const result = await pollUntilDone(rec, externalJobId);
      finalize(rec, result, opts.parentVideo);
    } catch (e) {
      fail(rec, e);
    }
  })();
  return rec;
}

export async function submitRemix(opts: SubmitRemixOptions): Promise<AiJobRecord> {
  const author = authorOfNew();
  const rec: AiJobRecord = {
    id: newId(),
    ownerUserId: author.id,
    ownerUsername: author.username,
    kind: 'prompt_remix',
    promptSummary: opts.prompt,
    parentVideoId: opts.parentVideo.id,
    status: 'queued',
    statusMsg: '排队中...',
    createdAt: Date.now(),
  };
  useJobsStoreInternal.getState().add(rec);
  (async () => {
    try {
      const externalJobId = await runProviderText(rec, opts.prompt);
      const result = await pollUntilDone(rec, externalJobId);
      finalize(rec, result, opts.parentVideo);
    } catch (e) {
      fail(rec, e);
    }
  })();
  return rec;
}

// 编辑发布:复用原 videoUrl,不调 provider
export function submitEditPublish(opts: SubmitEditOptions): AiJobRecord {
  const author = authorOfNew();
  const rec: AiJobRecord = {
    id: newId(),
    ownerUserId: author.id,
    ownerUsername: author.username,
    kind: 'edit_publish',
    promptSummary: opts.parentVideo.prompt,
    parentVideoId: opts.parentVideo.id,
    status: 'succeeded',
    statusMsg: '完成',
    createdAt: Date.now(),
    finishedAt: Date.now(),
    editMetadata: opts.editMetadata,
  };
  useJobsStoreInternal.getState().add(rec);
  const video = makeNewVideo({
    authorId: rec.ownerUserId === 'anon' ? null : rec.ownerUserId,
    authorUsername: author.username,
    prompt: opts.parentVideo.prompt,
    parent: opts.parentVideo,
    remixKind: 'edit',
    videoUrl: opts.parentVideo.video_url,
    thumbnailUrl: opts.parentVideo.thumbnail_url ?? undefined,
    tailFrameUrl: opts.parentVideo.tail_frame_url ?? undefined,
    durationMs: opts.parentVideo.duration_ms ?? undefined,
    width: opts.parentVideo.width ?? undefined,
    height: opts.parentVideo.height ?? undefined,
    aiProvider: opts.parentVideo.ai_provider ?? undefined,
    editMetadata: opts.editMetadata,
  });
  useLocalVideos.getState().addVideo(video);
  // 剪辑流程是用户显式"发布",直接公开
  useLocalVideos.getState().setVisibility(video.id, 'public');
  useLocalVideos.getState().bumpStat(opts.parentVideo.id, 'fork_count');
  useJobsStoreInternal.getState().patch(rec.id, { finishedVideoId: video.id });
  return rec;
}
