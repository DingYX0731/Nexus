import { supabase } from '@/api/client';
import type { Video } from '@/api/types';
import { getVideoRow } from './videosRepo';

/** 额度不足时从 callGenerate 抛出的可识别错误。 */
export class CreditsExhaustedError extends Error {
  code = 'credits_exhausted' as const;
  constructor() {
    super('额度不足');
    this.name = 'CreditsExhaustedError';
  }
}

export interface GenerateArgs {
  kind: 'text' | 'continuation' | 'remix';
  prompt: string;
  parentTailFrameUrl?: string;
  parentId?: string;
  aspect?: '9:16' | '16:9';
}

interface StartResp { videoId?: string; status?: string; error?: string }
interface PollResp { status?: 'generating' | 'ready' | 'failed'; error?: string }

const POLL_INTERVAL_MS = 4000;
const POLL_TIMEOUT_MS = 240_000; // 客户端总等待上限 4 分钟

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * 从 supabase-js 的 FunctionsHttpError 里挖出 Edge Function 返回的真实错误消息。
 * supabase-js 只给通用 message，真正的 { error: "..." } 藏在 err.context（原始 Response）里。
 */
async function extractEdgeError(err: unknown): Promise<string> {
  const ctx = (err as { context?: unknown })?.context;
  // context 是原始 Response，能读到 body
  if (ctx && typeof (ctx as Response).json === 'function') {
    try {
      const body = await (ctx as Response).clone().json();
      if (body?.error) return String(body.error);
    } catch {
      try {
        const txt = await (ctx as Response).clone().text();
        if (txt) return txt.slice(0, 300);
      } catch {
        // 落到下面的通用 message
      }
    }
  }
  return (err as Error)?.message ?? '发起生成失败';
}

/**
 * 对已有 videoId 进行续轮询，直到 ready/failed 或超时。
 * 供 callGenerate 内部使用，也供个人页进入时恢复未完成的轮询。
 */
export async function resumePoll(videoId: string): Promise<'ready' | 'failed'> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);
    const { data, error } = await supabase().functions.invoke('poll-video', { body: { videoId } });
    if (error) throw new Error(error.message);
    const poll = data as { status?: 'generating' | 'ready' | 'failed'; error?: string };
    if (poll.status === 'ready') return 'ready';
    if (poll.status === 'failed') return 'failed';
    // generating → 继续轮询
  }
  throw new Error('生成超时，请稍后在个人页查看');
}

/**
 * 异步两段式：先调 generate-video 发起任务拿 videoId，再轮询 poll-video 直到 ready/failed。
 * 对外仍返回最终 Video（保持调用方签名不变）。额度扣减/退还全在 Edge Function 服务端完成。
 */
export async function callGenerate(args: GenerateArgs): Promise<Video> {
  // 1. 发起
  const { data: startData, error: startErr } =
    await supabase().functions.invoke('generate-video', { body: args });
  if (startErr) {
    // supabase-js 对非 2xx 只给通用 message（"Edge Function returned a non-2xx status code"），
    // 真正的错误在 startErr.context（原始 Response）的 body 里。把它挖出来，不然用户只看到无意义的通用文案。
    const realError = await extractEdgeError(startErr);
    if (
      (startErr as any).status === 402 ||
      realError.includes('402') ||
      realError.includes('额度不足')
    ) {
      throw new CreditsExhaustedError();
    }
    throw new Error(realError);
  }
  const start = startData as StartResp;
  if (start.error) {
    if (start.error.includes('额度不足')) throw new CreditsExhaustedError();
    throw new Error(start.error);
  }
  if (!start.videoId) throw new Error('发起生成失败：缺少 videoId');

  const videoId = start.videoId;

  // 2. 复用 resumePoll 轮询
  const result = await resumePoll(videoId);
  if (result === 'ready') {
    const video = await getVideoRow(videoId);
    if (!video) throw new Error('生成完成但读取视频失败');
    return video;
  }
  throw new Error('AI 生成失败');
}
