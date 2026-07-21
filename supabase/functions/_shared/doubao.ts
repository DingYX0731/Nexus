// 豆包 Doubao-Seedance 文生/图生视频 —— 异步两段式。
// 接口对齐 src/ai/DoubaoProvider.ts（已验证可用）：
//   发起: POST /tasks            → { id }
//   查询: GET  /tasks?filter.task_ids={id} → { items: [{ status, content }] }
// 同步轮询会撞 Edge Function 墙钟上限，故拆成 createTask + queryTask 两个短调用。

const BASE = Deno.env.get('DOUBAO_BASE_URL') ?? 'https://llmapi.paratera.com';
// 不再保留服务端兜底 key —— 强制用户自带 key（见 resolveKey）。
const ENV_MODEL = Deno.env.get('DOUBAO_MODEL') ?? 'Doubao-Seedance-1.0-Pro';
const TASKS = '/v1/p001/contents/generations/tasks';

// 用户自带凭证：调用方（Edge Function）从请求体解出 apiKey/model 传进来，
// 未提供则回落到服务端环境变量。key 只在内存使用，绝不落库/打日志。
export interface UserCreds {
  apiKey?: string;
  model?: string;
}

const KEY_MAX_LEN = 400;
// 校验用户传入的 key 格式：非空、无空白、长度受限。不合法则回落 env（下面 resolveKey 处理）。
function sanitizeKey(k?: string): string {
  if (!k) return '';
  const t = k.trim();
  if (!t || t.length > KEY_MAX_LEN || /\s/.test(t)) return '';
  return t;
}

// 强制用户自带 key：不再回落服务端 env key。用户未配置合法 key 即返回空，
// 上层据此抛「未配置 API Key」错误，避免消耗共享额度。
function resolveKey(creds?: UserCreds): string {
  return sanitizeKey(creds?.apiKey);
}

// model 白名单校验：只允许已知安全的模型名字符集，防注入/滥用。未提供或非法则回落 env。
function resolveModel(creds?: UserCreds): string {
  const m = creds?.model?.trim();
  if (m && /^[A-Za-z0-9._-]{1,64}$/.test(m)) return m;
  return ENV_MODEL;
}

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

function authHeaders(key: string): HeadersInit {
  return { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
}

// 上游报错可能包含敏感信息（如平台可用模型清单）。对外只回泛化文案 + 状态码，
// 绝不把上游 body 原样透传给客户端；细节仅用于服务端 throw 的 message（不进响应体外的日志）。
function safeUpstreamError(status: number, kind: 'create' | 'query'): string {
  if (status === 401 || status === 403) return 'API Key 无效或无权限，请检查设置中的密钥';
  if (status === 404) return '所选模型不可用或无访问权限';
  if (status === 402 || status === 429) return '上游额度不足或请求过于频繁，请稍后再试';
  return kind === 'create' ? '发起生成失败，请稍后重试' : '查询生成状态失败，请稍后重试';
}

// 带超时的 fetch：避免某个请求永久挂起拖到 Edge Function 墙钟上限。
// 超时抛出更明确的错误（原生 AbortError 的 message 是无意义的 "The signal has been aborted"）。
async function fetchWithTimeout(input: string | URL, init: RequestInit, ms: number): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(input, { ...init, signal: ctrl.signal });
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') {
      throw new Error(`豆包请求超时（>${Math.round(ms / 1000)}s），服务端繁忙，请稍后重试`);
    }
    throw e;
  } finally {
    clearTimeout(t);
  }
}

// 带重试的 fetch：paratera/豆包端点偶发慢/抖动，超时或网络错时退避重试，吸收间歇性失败。
async function fetchWithRetry(
  input: string | URL, init: RequestInit, timeoutMs: number, retries: number,
): Promise<Response> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fetchWithTimeout(input, init, timeoutMs);
    } catch (e) {
      lastErr = e;
      // 最后一次不再等待，直接抛
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1))); // 1s, 2s 退避
      }
    }
  }
  throw lastErr;
}

function buildText(prompt: string, ratio: string, durationSec: number): string {
  return [prompt.trim(), `--ratio ${ratio}`, `--dur ${durationSec}`].join(' ');
}

/** 发起豆包生成任务，返回 task_id。几秒内返回。 */
export async function createTask(
  prompt: string,
  ratio: string,
  imageUrl?: string,
  creds?: UserCreds,
): Promise<string> {
  const key = resolveKey(creds);
  const model = resolveModel(creds);
  if (!key) throw new Error('未配置 API Key，请在设置中填写');
  const text = buildText(prompt, imageUrl ? 'adaptive' : ratio, 5);
  const content: unknown[] = [{ type: 'text', text }];
  if (imageUrl) content.push({ type: 'image_url', image_url: { url: imageUrl } });

  // 45s 超时 + 最多 2 次重试：发起任务是短请求，但 paratera 端点偶发慢，留足余量。
  const res = await fetchWithRetry(`${BASE}${TASKS}`, {
    method: 'POST',
    headers: authHeaders(key),
    body: JSON.stringify({ model, content }),
  }, 45_000, 2);
  if (!res.ok) {
    // 只读掉 body 释放连接，但不把上游内容透传（可能含敏感信息）。
    await res.text().catch(() => '');
    throw new Error(safeUpstreamError(res.status, 'create'));
  }
  const data = await res.json();
  if (!data.id) throw new Error('发起生成失败：上游未返回任务号');
  return data.id as string;
}

/** 查询单个豆包任务状态。一次短调用。 */
export async function queryTask(taskId: string, creds?: UserCreds): Promise<TaskStatus> {
  const key = resolveKey(creds);
  if (!key) throw new Error('未配置 API Key，请在设置中填写');
  const url = new URL(`${BASE}${TASKS}`);
  url.searchParams.set('filter.task_ids', taskId);
  // 查询是幂等的，超时/抖动时重试 1 次；单次查询失败不该拖垮整个轮询。
  const res = await fetchWithRetry(url, { headers: authHeaders(key) }, 30_000, 1);
  if (!res.ok) {
    await res.text().catch(() => '');
    throw new Error(safeUpstreamError(res.status, 'query'));
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
