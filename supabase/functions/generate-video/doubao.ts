// 豆包 Doubao-Seedance 文生/图生视频 —— 接口对齐 src/ai/DoubaoProvider.ts（已验证可用）。
// 关键：查询任务状态用 GET /tasks?filter.task_ids={id}，响应是 { items: [...] }，
// 不是 GET /tasks/{id}。早期版本用了错误的路径导致一直轮询超时。

const BASE = Deno.env.get('DOUBAO_BASE_URL') ?? 'https://llmapi.paratera.com';
const KEY = Deno.env.get('DOUBAO_API_KEY') ?? '';
const MODEL = Deno.env.get('DOUBAO_MODEL') ?? 'Doubao-Seedance-1.0-Pro';
const TASKS = '/v1/p001/contents/generations/tasks';

export interface GenResult {
  videoUrl: string;
  tailFrameUrl?: string;
  durationMs?: number;
  width?: number;
  height?: number;
}

interface StatusItem {
  id: string;
  status: string;
  content?: { video_url?: string; image_url?: string };
  ratio?: string;
  duration?: number;
  error?: { message?: string };
}

function authHeaders(): HeadersInit {
  return { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };
}

// 豆包接受 `--ratio` / `--dur` flags 写在 prompt 文本里。
function buildText(prompt: string, ratio: string, durationSec: number): string {
  const parts = [prompt.trim(), `--ratio ${ratio}`, `--dur ${durationSec}`];
  return parts.join(' ');
}

async function createTask(body: unknown): Promise<string> {
  const res = await fetch(`${BASE}${TASKS}`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errTxt = await res.text();
    throw new Error(`豆包创建任务失败 (${res.status}): ${errTxt.slice(0, 200)}`);
  }
  const data = await res.json();
  if (!data.id) throw new Error('豆包响应缺少 task id');
  return data.id as string;
}

async function pollTask(id: string): Promise<StatusItem | null> {
  // 真实接口：GET /tasks?filter.task_ids={id} → { total, items: [...] }
  const url = new URL(`${BASE}${TASKS}`);
  url.searchParams.set('filter.task_ids', id);
  const res = await fetch(url.toString(), { headers: authHeaders() });
  if (!res.ok) {
    const errTxt = await res.text();
    throw new Error(`豆包查询失败 (${res.status}): ${errTxt.slice(0, 200)}`);
  }
  const data = await res.json();
  return (data.items?.[0] as StatusItem | undefined) ?? null;
}

function isSucceeded(s: string): boolean {
  return s === 'succeeded' || s === 'success';
}
function isFailed(s: string): boolean {
  return s === 'failed' || s === 'error' || s === 'cancelled';
}

/**
 * 生成视频。kind=continuation 时传 imageUrl（图生视频）。
 * 同步轮询直到出片或超时（墙钟上限约 150s，这里留余量到 140s 给转存）。
 */
export async function generate(
  prompt: string,
  ratio: string,
  imageUrl?: string,
): Promise<GenResult> {
  if (!KEY) throw new Error('DOUBAO_API_KEY 未配置');

  const text = buildText(prompt, imageUrl ? 'adaptive' : ratio, 5);
  const content: unknown[] = [{ type: 'text', text }];
  if (imageUrl) content.push({ type: 'image_url', image_url: { url: imageUrl } });

  const id = await createTask({ model: MODEL, content });

  const deadline = Date.now() + 140_000;
  while (Date.now() < deadline) {
    const item = await pollTask(id);
    if (item) {
      if (isSucceeded(item.status)) {
        const url = item.content?.video_url;
        if (!url) throw new Error('成功但缺少 video_url');
        return {
          videoUrl: url,
          tailFrameUrl: item.content?.image_url,
          durationMs: item.duration ? item.duration * 1000 : undefined,
        };
      }
      if (isFailed(item.status)) {
        throw new Error(item.error?.message ?? '豆包生成失败');
      }
    }
    await new Promise((res) => setTimeout(res, 4000));
  }
  throw new Error('生成超时');
}
