// AI 任务状态机。
//
// 设计要点:
// - 用户点击"生成"后立即返回(不阻塞 UI),任务进入后台
// - 任务列表显示在 Create 页,实时反映进度
// - 任务完成后:videos store 自动接收新视频,并触发本地 "刚完成" 标记
// - 应用切到后台不影响轮询(MVP 阶段);M3 会迁到 Edge Function + Realtime
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import type { Video } from '@/api/types';
import { defaultProvider } from '@/ai/VideoGenProvider';
import { useLocalVideos, makeNewVideo } from './videos';
import { useAuth } from './auth';
import { useCredits } from './credits';
import { showToast } from '@/components/toast/Toast';
import { showDialog } from '@/components/dialog/ConfirmDialog';
import { hasSupabase } from '@/api/client';
import { callGenerate, CreditsExhaustedError } from '@/api/supabase/generateClient';
import { grantCreditsRemote } from '@/api/supabase/creditsRepo';
import { uploadTailFrame } from '@/api/supabase/framesRepo';
import { extractLastFrame } from '@/hooks/useVideoThumbnail';
import { queryClient } from '@/api/queryClient';

export type JobKind = 'text_to_video' | 'continuation' | 'prompt_remix';
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
}

interface JobsStore {
  jobs: AiJobRecord[];
  add: (r: AiJobRecord) => void;
  patch: (id: string, patch: Partial<AiJobRecord>) => void;
  cancel: (id: string) => void;
  visibleFor: (userId: string) => AiJobRecord[];
}

const useJobsStoreInternal = create<JobsStore>()(
  persist(
    (set, get) => ({
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
    }),
    {
      name: 'ai-jobs',
      storage: createJSONStorage(() => AsyncStorage),
      // 只持久化 jobs 列表本身
      partialize: (s) => ({ jobs: s.jobs }),
      // 重启后：内存里的轮询协程已断，仍停留在 queued/running 的旧任务不会再有人推进。
      // 标记为 failed(可重试文案)，避免它们永远转圈；已完成/失败/取消的原样保留。
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        state.jobs = state.jobs.map((j) =>
          j.status === 'queued' || j.status === 'running'
            ? { ...j, status: 'failed' as const, statusMsg: '生成中断（App 已重开），请重试' }
            : j,
        );
      },
    },
  ),
);

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
function authorOfNew(): { id: string; username: string } {
  const { user, isAnonymous } = useAuth.getState();
  if (isAnonymous || !user) return { id: 'anon', username: '匿名用户' };
  return { id: user.id, username: user.username };
}

// ── 保底（本地 Mock）路径专用辅助函数 ──────────────────────────────────────

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
}, parent?: Video) {
  // cancel guard #3:即使 poll 已经返回 succeeded,中间可能用户已经 cancel 了
  const cur = useJobsStoreInternal.getState().jobs.find((j) => j.id === rec.id);
  if (!cur || cur.status === 'cancelled') return;

  const remixKind = rec.kind === 'continuation' ? 'continuation' :
    rec.kind === 'prompt_remix' ? 'prompt_remix' : undefined;
  const video = makeNewVideo({
    authorId: rec.ownerUserId === 'anon' ? null : rec.ownerUserId,
    authorUsername: rec.ownerUsername, // 用提交时快照,不读当前登录态
    prompt: rec.promptSummary,
    parent,
    remixKind,
    aiProvider: defaultProvider.name,
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
  const isCreditsExhausted =
    err instanceof CreditsExhaustedError || err?.code === 'credits_exhausted';
  const msg = wasCancelled ? '已取消' : (err?.message ?? '生成失败');
  useJobsStoreInternal.getState().patch(rec.id, {
    status: wasCancelled ? 'cancelled' : 'failed',
    statusMsg: isCreditsExhausted ? '额度不足' : msg,
    finishedAt: Date.now(),
  });
  // 失败/取消都退还额度——仅保底模式在客户端扣减,Supabase 模式由 Edge Function 负责。
  if (!hasSupabase && rec.ownerUserId !== 'anon') {
    useCredits.getState().refund(rec.ownerUserId);
  }
  if (wasCancelled) return;

  if (isCreditsExhausted && hasSupabase) {
    // 额度不足:弹引导对话框,允许用户领取体验额度
    const userId = rec.ownerUserId;
    showDialog({
      title: '额度不足',
      message: '你的生成额度已耗尽。可以领取 5 个体验额度继续创作。',
      primaryLabel: '领取体验额度',
      secondaryLabel: '知道了',
      icon: 'sparkles',
      onPrimary: async () => {
        try {
          await grantCreditsRemote(5);
          await useCredits.getState().syncRemote(userId);
          showToast({ message: '已领取 5 额度,快去创作吧!' });
        } catch (e: any) {
          showToast({ message: `领取失败:${e?.message ?? '请稍后重试'}`, durationMs: 4000 });
        }
      },
    });
    return;
  }

  showToast({ message: `生成失败:${msg}`, durationMs: 4000 });
}

// ── Supabase 路径辅助：单次 callGenerate，完成后入本地流 ──────────────────

async function runWithSupabase(
  rec: AiJobRecord,
  generateArgs: Parameters<typeof callGenerate>[0],
  parent?: Video,
): Promise<void> {
  useJobsStoreInternal.getState().patch(rec.id, { status: 'running', statusMsg: '正在生成,请稍候...' });
  const video = await callGenerate(generateArgs);
  // cancel guard:生成期间用户可能已取消
  const cur = useJobsStoreInternal.getState().jobs.find((j) => j.id === rec.id);
  if (!cur || cur.status === 'cancelled') return;
  // Supabase 模式:视频是草稿(private)且屏幕从云端读,不塞内存 feed。
  // invalidate 让个人页(myVideos)刷新看到新草稿;feed 也刷新(虽然草稿不显示,续写父视频 fork_count 可能变)。
  queryClient.invalidateQueries({ queryKey: ['myVideos'] });
  queryClient.invalidateQueries({ queryKey: ['feed'] });
  if (parent) queryClient.invalidateQueries({ queryKey: ['video', parent.id] });
  useJobsStoreInternal.getState().patch(rec.id, {
    status: 'succeeded',
    statusMsg: '完成',
    finishedAt: Date.now(),
    finishedVideoId: video.id,
  });
  showToast({
    message: '你的视频已生成',
    actionLabel: '查看',
    onAction: () => router.push(`/video/${video.id}`),
  });
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
  if (hasSupabase) {
    (async () => {
      try {
        await runWithSupabase(rec, { kind: 'text', prompt: opts.prompt, aspect: opts.aspect });
      } catch (e) {
        fail(rec, e);
      }
    })();
  } else {
    (async () => {
      try {
        const externalJobId = await runProviderText(rec, opts.prompt);
        const result = await pollUntilDone(rec, externalJobId);
        finalize(rec, result);
      } catch (e) {
        fail(rec, e);
      }
    })();
  }
  return rec;
}

// 解析续写首帧：拿到上一段视频「最后一帧」的公开 URL 传给豆包（图生视频）。
// 豆包服务端 fetch 图片，必须是公开 URL，不能是本地 file://。
// 1) 已有 tail_frame_url（demo 视频回填过 / 未来回填）→ 直接用
// 2) Supabase 模式且无尾帧 → 客户端抽末帧 + 上传 thumbnails 得公开 URL
// 3) 兜底 → thumbnail_url ?? undefined（退化为纯文生，行为同旧版）
async function resolveContinuationFrame(rec: AiJobRecord, parentVideo: Video): Promise<string | undefined> {
  if (parentVideo.tail_frame_url) return parentVideo.tail_frame_url;
  if (hasSupabase && parentVideo.video_url) {
    try {
      useJobsStoreInternal.getState().patch(rec.id, { statusMsg: '正在提取上一段末帧...' });
      const localUri = await extractLastFrame(parentVideo.video_url, parentVideo.duration_ms);
      if (localUri) {
        // rec.id 每次提交唯一，保证同一父视频多次续写各自的尾帧 URL 不同，避免串帧
        const publicUrl = await uploadTailFrame(localUri, parentVideo.id, rec.id);
        return publicUrl;
      }
    } catch {
      // 抽帧/上传失败不阻断，退回兜底
    }
  }
  return parentVideo.thumbnail_url ?? undefined;
}

export async function submitContinuation(opts: SubmitContinuationOptions): Promise<AiJobRecord> {
  const author = authorOfNew();
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
  if (hasSupabase) {
    (async () => {
      try {
        const frameUrl = await resolveContinuationFrame(rec, opts.parentVideo);
        await runWithSupabase(
          rec,
          {
            kind: 'continuation',
            prompt: opts.prompt,
            parentId: opts.parentVideo.id,
            parentTailFrameUrl: frameUrl,
          },
          opts.parentVideo,
        );
      } catch (e) {
        fail(rec, e);
      }
    })();
  } else {
    // 兜底（本地 mock）：优先用尾帧，无则用缩略图
    const frameUrl = opts.parentVideo.tail_frame_url ?? opts.parentVideo.thumbnail_url ?? undefined;
    (async () => {
      try {
        let externalJobId: string;
        if (frameUrl) {
          externalJobId = await runProviderImage(rec, frameUrl, opts.prompt);
        } else {
          externalJobId = await runProviderText(rec, opts.prompt);
        }
        const result = await pollUntilDone(rec, externalJobId);
        finalize(rec, result, opts.parentVideo);
      } catch (e) {
        fail(rec, e);
      }
    })();
  }
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
  if (hasSupabase) {
    (async () => {
      try {
        await runWithSupabase(
          rec,
          { kind: 'remix', prompt: opts.prompt, parentId: opts.parentVideo.id },
          opts.parentVideo,
        );
      } catch (e) {
        fail(rec, e);
      }
    })();
  } else {
    (async () => {
      try {
        const externalJobId = await runProviderText(rec, opts.prompt);
        const result = await pollUntilDone(rec, externalJobId);
        finalize(rec, result, opts.parentVideo);
      } catch (e) {
        fail(rec, e);
      }
    })();
  }
  return rec;
}
