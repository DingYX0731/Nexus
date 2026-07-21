import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { applyCharge } from '../_shared/credits.ts';
import { createTask } from '../_shared/doubao.ts';

// 异步两段式 · 第一段：发起生成。
// 校验 JWT → 扣额度 → 调豆包发起任务 → 插 videos 占位行(status=generating) → 立即返回。
// 几秒返回，不撞墙钟。出片与转存由 poll-video 函数完成；失败退款也在那里。

const COST = 1;

function json(obj: unknown, status: number): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
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
    const body = await req.json();
    const { kind, prompt, parentTailFrameUrl, parentId, aspect, apiKey, model } = body;
    // apiKey/model 为用户自带凭证：只在本次请求内存中使用，绝不落库、绝不打日志。
    const creds = { apiKey, model };

    // Prompt 输入校验（在扣额度之前，避免无效请求也扣额度）
    if (typeof prompt !== 'string') {
      return json({ error: 'prompt 必须是字符串' }, 400);
    }
    if (!prompt.trim()) {
      return json({ error: 'prompt 不能为空' }, 400);
    }
    if (prompt.length > 2000) {
      return json({ error: 'prompt 过长' }, 400);
    }

    // 1. 读余额 + 扣（service role，绕过 RLS）
    const { data: cRow } = await admin
      .from('credits').select('balance').eq('user_id', user.id).maybeSingle();
    const charged = applyCharge(cRow?.balance ?? 0, COST);
    if (!charged.ok) return json({ error: '额度不足' }, 402);
    await admin.from('credits').update({ balance: charged.next }).eq('user_id', user.id);

    try {
      // 2. 调豆包发起任务（几秒）
      const taskId = await createTask(
        prompt,
        aspect ?? '9:16',
        kind === 'continuation' ? parentTailFrameUrl : undefined,
        creds,
      );

      // 3. 算 root/depth/remix_kind
      const vid = crypto.randomUUID();
      let rootId = vid, depth = 0, remixKind: string | null = null;
      if (parentId) {
        const { data: parent } = await admin
          .from('videos').select('root_id,depth').eq('id', parentId).maybeSingle();
        if (parent) { rootId = parent.root_id; depth = parent.depth + 1; }
        remixKind = kind === 'continuation' ? 'continuation' : 'prompt_remix';
      }

      // 4. 插占位行 status=generating，记 doubao_task_id；video_url 暂存空串
      const { data: inserted, error: insErr } = await admin.from('videos').insert({
        id: vid,
        author_id: user.id,
        parent_id: parentId ?? null,
        root_id: rootId,
        remix_kind: remixKind,
        depth,
        prompt,
        video_url: '',
        ai_provider: 'doubao',
        status: 'generating',
        visibility: 'private',
        doubao_task_id: taskId,
      }).select('id').single();
      if (insErr) throw insErr;

      // 5. 立即返回 videoId + generating
      return json({ videoId: (inserted as { id: string }).id, status: 'generating' }, 200);
    } catch (genErr) {
      // 发起阶段失败：退还额度（短调用，可靠执行，写回扣前余额）
      await admin.from('credits').update({ balance: cRow?.balance ?? 0 }).eq('user_id', user.id);
      return json({ error: String((genErr as Error).message ?? genErr) }, 500);
    }
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});
