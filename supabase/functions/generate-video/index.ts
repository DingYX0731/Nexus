import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { applyCharge } from '../_shared/credits.ts';
import { generate } from './doubao.ts';

const COST = 1;

Deno.serve(async (req) => {
  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    const jwt = authHeader.replace('Bearer ', '');
    const url = Deno.env.get('SUPABASE_URL')!;
    const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
    const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const userClient = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
    const { data: ures } = await userClient.auth.getUser(jwt);
    const user = ures?.user;
    if (!user) return json({ error: '未登录' }, 401);

    const admin = createClient(url, service);
    const body = await req.json();
    const { kind, prompt, parentTailFrameUrl, parentId, aspect } = body;

    // 1. 读余额 + 扣
    const { data: cRow } = await admin.from('credits').select('balance').eq('user_id', user.id).maybeSingle();
    const charged = applyCharge(cRow?.balance ?? 0, COST);
    if (!charged.ok) return json({ error: '额度不足' }, 402);
    await admin.from('credits').update({ balance: charged.next }).eq('user_id', user.id);

    try {
      // 2. 调豆包
      const gen = await generate(prompt, kind === 'continuation' ? parentTailFrameUrl : undefined);

      // 3. 下载并转存
      const vid = crypto.randomUUID();
      const videoUrl = await store(admin, 'videos', `${user.id}/${vid}.mp4`, gen.videoUrl, 'video/mp4');
      let thumbUrl: string | null = null;
      if (gen.tailFrameUrl) thumbUrl = await store(admin, 'thumbnails', `${user.id}/${vid}.jpg`, gen.tailFrameUrl, 'image/jpeg');

      // 4. 取父视频算 root/depth
      let rootId = vid, depth = 0, remixKind: string | null = null;
      if (parentId) {
        const { data: parent } = await admin.from('videos').select('root_id,depth').eq('id', parentId).maybeSingle();
        if (parent) { rootId = parent.root_id; depth = parent.depth + 1; }
        remixKind = kind === 'continuation' ? 'continuation' : 'prompt_remix';
      }

      // 5. 插 videos 行
      const { data: inserted, error: insErr } = await admin.from('videos').insert({
        id: vid, author_id: user.id, parent_id: parentId ?? null, root_id: rootId,
        remix_kind: remixKind, depth, prompt, video_url: videoUrl, thumbnail_url: thumbUrl,
        tail_frame_url: thumbUrl, ai_provider: 'doubao', status: 'ready', visibility: 'public',
      }).select('*').single();
      if (insErr) throw insErr;

      const { data: full } = await admin.from('video_with_stats')
        .select('*, author:profiles!videos_author_id_fkey(*)').eq('id', vid).single();
      return json(full ?? inserted, 200);
    } catch (genErr) {
      // 失败退还额度
      await admin.from('credits').update({ balance: (cRow?.balance ?? 0) }).eq('user_id', user.id);
      return json({ error: String((genErr as Error).message ?? genErr) }, 500);
    }
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});

async function store(admin: any, bucket: string, path: string, srcUrl: string, contentType: string): Promise<string> {
  const res = await fetch(srcUrl);
  const buf = new Uint8Array(await res.arrayBuffer());
  const { error } = await admin.storage.from(bucket).upload(path, buf, { contentType, upsert: true });
  if (error) throw error;
  const { data } = admin.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl as string;
}

function json(obj: unknown, status: number): Response {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });
}
