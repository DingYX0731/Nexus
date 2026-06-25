import type { AiJob, AiJobStatus, ImageToVideoInput, TextToVideoInput, VideoGenProvider } from './types';

// 豆包 Doubao-Seedance-1.0-Pro 文生 / 图生视频。
//
// 关键约束:
// - video_url 是签名 URL,**24h 后过期**。MVP 直接用,长期需要转存 Storage。
// - 一次任务约 1-2 分钟、~25 万 tokens / 5 秒视频,谨慎使用。
// - 客户端持密钥仅供 demo;生产需走 Edge Function 中转。

const BASE_URL =
  (process.env.EXPO_PUBLIC_DOUBAO_BASE_URL as string | undefined) ?? 'https://llmapi.paratera.com';
const API_KEY = (process.env.EXPO_PUBLIC_DOUBAO_API_KEY as string | undefined) ?? '';
const MODEL = (process.env.EXPO_PUBLIC_DOUBAO_MODEL as string | undefined) ?? 'Doubao-Seedance-1.0-Pro';

const TASKS_PATH = '/v1/p001/contents/generations/tasks';

function authHeaders(): HeadersInit {
  if (!API_KEY) {
    throw new Error(
      'EXPO_PUBLIC_DOUBAO_API_KEY 未设置。请在 .env 里填上豆包 API key,然后重启 Metro。',
    );
  }
  return {
    Authorization: `Bearer ${API_KEY}`,
    'Content-Type': 'application/json',
  };
}

interface CreateResponse { id: string }
interface StatusItem {
  id: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | string;
  content?: { video_url?: string; image_url?: string };
  resolution?: string;
  ratio?: string;
  duration?: number;
  framespersecond?: number;
  error?: { message?: string };
}
interface StatusResponse { total: number; items: StatusItem[] }

function mapStatus(s: string): AiJobStatus {
  switch (s) {
    case 'queued':
    case 'pending':
      return 'queued';
    case 'running':
    case 'processing':
      return 'running';
    case 'succeeded':
    case 'success':
      return 'succeeded';
    case 'failed':
    case 'error':
    case 'cancelled':
      return 'failed';
    default:
      return 'running';
  }
}

// 豆包接受 `--ratio` / `--dur` flags 在 prompt 文本里。
function buildText(prompt: string, opts: { ratio?: string; durationSec?: number }) {
  const parts = [prompt.trim()];
  if (opts.ratio) parts.push(`--ratio ${opts.ratio}`);
  if (opts.durationSec) parts.push(`--dur ${opts.durationSec}`);
  return parts.join(' ');
}

async function createTask(body: unknown): Promise<string> {
  const res = await fetch(`${BASE_URL}${TASKS_PATH}`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errTxt = await res.text();
    throw new Error(`豆包创建任务失败 (${res.status}): ${errTxt.slice(0, 200)}`);
  }
  const data = (await res.json()) as CreateResponse;
  if (!data.id) throw new Error('豆包响应缺少 task id');
  return data.id;
}

export const DoubaoProvider: VideoGenProvider = {
  name: 'doubao',

  async textToVideo(input: TextToVideoInput) {
    const ratio = input.aspect ?? '9:16';
    const text = buildText(input.prompt, { ratio, durationSec: input.durationSec ?? 5 });
    const jobId = await createTask({
      model: MODEL,
      content: [{ type: 'text', text }],
    });
    return { jobId };
  },

  async imageToVideo(input: ImageToVideoInput) {
    const text = buildText(input.prompt, { ratio: 'adaptive', durationSec: input.durationSec ?? 5 });
    const jobId = await createTask({
      model: MODEL,
      content: [
        { type: 'text', text },
        { type: 'image_url', image_url: { url: input.imageUrl } },
      ],
    });
    return { jobId };
  },

  async getJob(jobId: string): Promise<AiJob> {
    const url = new URL(`${BASE_URL}${TASKS_PATH}`);
    url.searchParams.set('filter.task_ids', jobId);
    const res = await fetch(url.toString(), { headers: authHeaders() });
    if (!res.ok) {
      const errTxt = await res.text();
      return { jobId, status: 'failed', error: `查询失败 (${res.status}): ${errTxt.slice(0, 200)}` };
    }
    const data = (await res.json()) as StatusResponse;
    const item = data.items?.[0];
    if (!item) return { jobId, status: 'failed', error: 'task not found' };
    const status = mapStatus(item.status);
    if (status === 'succeeded') {
      const videoUrl = item.content?.video_url;
      if (!videoUrl) return { jobId, status: 'failed', error: '成功但缺少 video_url' };
      return {
        jobId,
        status: 'succeeded',
        videoUrl,
        // 豆包响应里没单独的 thumbnail/tail frame URL;沿用 videoUrl 占位(VideoPlayer 不依赖它)。
        // tail_frame_url 后续可通过取视频末帧或截图接口补充。
        durationMs: item.duration ? item.duration * 1000 : undefined,
        width: item.ratio === '9:16' ? 1080 : undefined,
        height: item.ratio === '9:16' ? 1920 : undefined,
      };
    }
    if (status === 'failed') {
      return { jobId, status: 'failed', error: item.error?.message ?? '生成失败' };
    }
    return { jobId, status };
  },
};
