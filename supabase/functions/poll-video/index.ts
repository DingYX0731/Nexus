import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { queryTask } from '../_shared/doubao.ts';

// 异步两段式 · 第二段：轮询。
// 客户端每隔几秒调一次。校验 JWT → 查 video 行的 doubao_task_id → 查豆包状态：
//   - 还在生成 → 返回 { status: 'generating' }
//   - 成功 → 下载豆包视频转存 Storage、更新行 status=ready+video_url、返回 ready
//   - 失败 → 更新行 status=failed、退还 1 额度、返回 failed
// 每次调用都是短请求，不撞墙钟。转存只在成功那一次发生。

const COST = 1;

function json(obj: unknown, status: number): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// 下载豆包视频（40s 超时 + 最多 2 次退避重试）。豆包签名 URL 有效但下载偶发抖动，
// 一次失败就判死整个任务太浪费（豆包任务已成功、已烧 token）。upsert 幂等，重试安全。
async function downloadWithRetry(srcUrl: string, retries: number): Promise<Uint8Array> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 40_000);
    try {
      const res = await fetch(srcUrl, { signal: ctrl.signal });
      if (!res.ok) throw new Error(`下载视频失败 ${res.status}`);
      return new Uint8Array(await res.arrayBuffer());
    } catch (e) {
      lastErr = (e as Error)?.name === 'AbortError' ? new Error('下载视频超时（>40s）') : e;
      if (attempt < retries) await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
    } finally {
      clearTimeout(t);
    }
  }
  throw lastErr;
}

async function store(
  admin: any, bucket: string, path: string, srcUrl: string, contentType: string,
): Promise<string> {
  const buf = await downloadWithRetry(srcUrl, 2);
  const { error } = await admin.storage.from(bucket).upload(path, buf, { contentType, upsert: true });
  if (error) throw error;
  const { data } = admin.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl as string;
}

Deno.serve(async (req) => {
  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    const jwt = authHeader.replace('Bearer ', '');
    const url = Deno.env.get('SUPABASE_URL')!;
    const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
    const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const userClient = createClient(url, anon, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: ures } = await userClient.auth.getUser(jwt);
    const user = ures?.user;
    if (!user) return json({ error: '未登录' }, 401);

    const admin = createClient(url, service);
    const { videoId } = await req.json();
    if (!videoId) return json({ error: '缺少 videoId' }, 400);

    // 查 video 行（确认归属 + 拿 task_id + 当前状态 + 创建时间）
    const { data: row } = await admin
      .from('videos')
      .select('id,author_id,status,doubao_task_id,created_at')
      .eq('id', videoId).maybeSingle();
    if (!row) return json({ error: 'video 未找到' }, 404);
    if (row.author_id !== user.id) return json({ error: '无权访问' }, 403);

    // 已经是终态，直接返回（幂等：重复 poll 不重复转存/退款）
    if (row.status === 'ready') return json({ status: 'ready', videoId }, 200);
    if (row.status === 'failed') return json({ status: 'failed', videoId }, 200);
    if (!row.doubao_task_id) return json({ error: '缺少 task id' }, 500);

    // 查豆包
    const task = await queryTask(row.doubao_task_id);

    if (task.state === 'queued' || task.state === 'running') {
      return json({ status: 'generating', videoId }, 200);
    }

    if (task.state === 'failed') {
      // 标记失败 + 退还额度
      await admin.from('videos').update({ status: 'failed' }).eq('id', videoId);
      const { data: cRow } = await admin
        .from('credits').select('balance').eq('user_id', user.id).maybeSingle();
      await admin.from('credits')
        .update({ balance: (cRow?.balance ?? 0) + COST }).eq('user_id', user.id);
      return json({ status: 'failed', videoId, error: task.error ?? '生成失败' }, 200);
    }

    // succeeded：转存 Storage（只在这一次发生）
    try {
      // 主视频转存成功 = 生成成功。这是硬性成功条件。
      const videoUrl = await store(
        admin, 'videos', `${user.id}/${videoId}.mp4`, task.videoUrl!, 'video/mp4',
      );
      // 缩略图是「尽力而为」：豆包对文生/续写常不返回 image_url，且缩略图失败不该拖垮整体。
      // 单独 try/catch，失败就置空，绝不影响主视频判定为 ready。
      let thumbUrl: string | null = null;
      if (task.tailFrameUrl) {
        try {
          thumbUrl = await store(
            admin, 'thumbnails', `${user.id}/${videoId}.jpg`, task.tailFrameUrl, 'image/jpeg',
          );
        } catch (_thumbErr) {
          thumbUrl = null; // 缩略图失败无所谓
        }
      }
      await admin.from('videos').update({
        status: 'ready',
        video_url: videoUrl,
        thumbnail_url: thumbUrl,
        tail_frame_url: thumbUrl,
        duration_ms: task.durationMs ?? null,
      }).eq('id', videoId);
      return json({ status: 'ready', videoId }, 200);
    } catch (storeErr) {
      // 转存失败不立即判死：豆包签名 URL 24h 内都有效，下次 poll 可重试转存（幂等 upsert）。
      // 只有从创建起超过 6 分钟仍转存不成功，才真正判死 + 退款，避免无限重试。
      const ageMs = Date.now() - new Date(row.created_at as string).getTime();
      const GIVE_UP_MS = 6 * 60 * 1000;
      if (ageMs < GIVE_UP_MS) {
        // 保持 generating，让客户端下次 poll 再试
        return json({ status: 'generating', videoId }, 200);
      }
      // 写 failed 前再查一次状态：防止并发 poll 中另一路已写成 ready，被这里覆盖。
      const { data: latest } = await admin
        .from('videos').select('status').eq('id', videoId).maybeSingle();
      if (latest?.status === 'ready') {
        return json({ status: 'ready', videoId }, 200);
      }
      await admin.from('videos').update({ status: 'failed' }).eq('id', videoId);
      const { data: cRow } = await admin
        .from('credits').select('balance').eq('user_id', user.id).maybeSingle();
      await admin.from('credits')
        .update({ balance: (cRow?.balance ?? 0) + COST }).eq('user_id', user.id);
      return json({ status: 'failed', videoId, error: String((storeErr as Error).message) }, 200);
    }
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});
