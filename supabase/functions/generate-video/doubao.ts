// 豆包 Doubao-Seedance 文生/图生视频 —— 异步两段式。
// 接口对齐 src/ai/DoubaoProvider.ts（已验证可用）：
//   发起: POST /tasks            → { id }
//   查询: GET  /tasks?filter.task_ids={id} → { items: [{ status, content }] }
// 同步轮询会撞 Edge Function 墙钟上限，故拆成 createTask + queryTask 两个短调用。

const BASE = Deno.env.get('DOUBAO_BASE_URL') ?? 'https://llmapi.paratera.com';
const KEY = Deno.env.get('DOUBAO_API_KEY') ?? '';
const MODEL = Deno.env.get('DOUBAO_MODEL') ?? 'Doubao-Seedance-1.0-Pro';
const TASKS = '/v1/p001/contents/generations/tasks';

export interface TaskStatus {
  state: 'queued' | 'running' | 'succeeded' | 'failed';
  videoUrl?: string;
  tailFrameUrl?: string;
  durationMs?: number;
  error?: string;
}

interface StatusItem {
  id: string;
  status: string;
  content?: { video_url?: string; image_url?: string };
  duration?: number;
  error?: { message?: string };
}

function authHeaders(): HeadersInit {
  return { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };
}

function buildText(prompt: string, ratio: string, durationSec: number): string {
  return [prompt.trim(), `--ratio ${ratio}`, `--dur ${durationSec}`].join(' ');
}

/** 发起豆包生成任务，返回 task_id。几秒内返回。 */
export async function createTask(
  prompt: string,
  ratio: string,
  imageUrl?: string,
): Promise<string> {
  if (!KEY) throw new Error('DOUBAO_API_KEY 未配置');
  const text = buildText(prompt, imageUrl ? 'adaptive' : ratio, 5);
  const content: unknown[] = [{ type: 'text', text }];
  if (imageUrl) content.push({ type: 'image_url', image_url: { url: imageUrl } });

  const res = await fetch(`${BASE}${TASKS}`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ model: MODEL, content }),
  });
  if (!res.ok) {
    const errTxt = await res.text();
    throw new Error(`豆包创建任务失败 (${res.status}): ${errTxt.slice(0, 200)}`);
  }
  const data = await res.json();
  if (!data.id) throw new Error('豆包响应缺少 task id');
  return data.id as string;
}

/** 查询单个豆包任务状态。一次短调用。 */
export async function queryTask(taskId: string): Promise<TaskStatus> {
  if (!KEY) throw new Error('DOUBAO_API_KEY 未配置');
  const url = new URL(`${BASE}${TASKS}`);
  url.searchParams.set('filter.task_ids', taskId);
  const res = await fetch(url.toString(), { headers: authHeaders() });
  if (!res.ok) {
    const errTxt = await res.text();
    throw new Error(`豆包查询失败 (${res.status}): ${errTxt.slice(0, 200)}`);
  }
  const data = await res.json();
  const item = (data.items?.[0] as StatusItem | undefined) ?? null;
  if (!item) return { state: 'queued' };

  const s = item.status;
  if (s === 'succeeded' || s === 'success') {
    const videoUrl = item.content?.video_url;
    if (!videoUrl) return { state: 'failed', error: '成功但缺少 video_url' };
    return {
      state: 'succeeded',
      videoUrl,
      tailFrameUrl: item.content?.image_url,
      durationMs: item.duration ? item.duration * 1000 : undefined,
    };
  }
  if (s === 'failed' || s === 'error' || s === 'cancelled') {
    return { state: 'failed', error: item.error?.message ?? '豆包生成失败' };
  }
  return { state: s === 'running' || s === 'processing' ? 'running' : 'queued' };
}
