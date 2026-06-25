const BASE = Deno.env.get('DOUBAO_BASE_URL') ?? 'https://llmapi.paratera.com';
const KEY = Deno.env.get('DOUBAO_API_KEY') ?? '';
const MODEL = Deno.env.get('DOUBAO_MODEL') ?? 'Doubao-Seedance-1.0-Pro';
const TASKS = '/v1/p001/contents/generations/tasks';

export interface GenResult { videoUrl: string; tailFrameUrl?: string; durationMs?: number; width?: number; height?: number; }

export async function generate(prompt: string, imageUrl?: string): Promise<GenResult> {
  if (!KEY) throw new Error('DOUBAO_API_KEY 未配置');
  const body: Record<string, unknown> = { model: MODEL, content: [{ type: 'text', text: prompt }] };
  if (imageUrl) (body.content as unknown[]).push({ type: 'image_url', image_url: { url: imageUrl } });
  const create = await fetch(`${BASE}${TASKS}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!create.ok) throw new Error(`豆包发起失败 ${create.status}`);
  const { id } = await create.json();

  const deadline = Date.now() + 140_000; // 留余量给转存，墙钟上限约 150s
  while (Date.now() < deadline) {
    const r = await fetch(`${BASE}${TASKS}/${id}`, { headers: { Authorization: `Bearer ${KEY}` } });
    const j = await r.json();
    const status = j.status ?? j.state;
    if (status === 'succeeded' || status === 'success') {
      const url = j.content?.video_url ?? j.video_url;
      if (!url) throw new Error('成功但缺少 video_url');
      return { videoUrl: url, tailFrameUrl: j.content?.image_url, durationMs: undefined };
    }
    if (status === 'failed' || status === 'error') throw new Error(j.error ?? '豆包生成失败');
    await new Promise((res) => setTimeout(res, 4000));
  }
  throw new Error('生成超时');
}
