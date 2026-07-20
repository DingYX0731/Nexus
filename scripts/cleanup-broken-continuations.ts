/**
 * cleanup-broken-continuations.ts — 清理"首尾帧对不上"的旧续写视频。
 *
 * 背景：修复前生成的续写视频没带首帧（tail_frame_url 为空），画面接不上。
 * 判定：remix_kind='continuation' 且 tail_frame_url is null。
 *
 * 默认 dry-run（只列不删）。确认无误后加 --apply 执行删除。
 *
 * 运行（凭证从 env 读，不写进代码，别贴到聊天）：
 *   SUPABASE_URL=https://<ref>.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=<service_role_key> \
 *   npx tsx scripts/cleanup-broken-continuations.ts          # dry-run，只列
 *
 *   ... npx tsx scripts/cleanup-broken-continuations.ts --apply   # 真删
 *
 * 注意：videos.parent_id 是 on delete set null，删中间节点会让其子视频 parent_id 变 null
 * （成为新的独立根）。这些本就是坏数据分支，可接受。
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const APPLY = process.argv.includes('--apply');

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('缺少环境变量 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

async function main() {
  const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });

  // 查所有 remix_kind='continuation' 且 tail_frame_url 为空的视频
  const { data: rows, error } = await supabase
    .from('videos')
    .select('id,author_id,depth,root_id,prompt,tail_frame_url,visibility,created_at')
    .eq('remix_kind', 'continuation')
    .is('tail_frame_url', null)
    .order('created_at', { ascending: true });
  if (error) {
    console.error('查询失败:', error.message);
    process.exit(1);
  }

  if (!rows || rows.length === 0) {
    console.log('没有需要清理的坏续写视频。');
    return;
  }

  console.log(`找到 ${rows.length} 条首帧对不上的旧续写视频：\n`);
  for (const r of rows) {
    const prompt = (r.prompt ?? '').slice(0, 50).replace(/\n/g, ' ');
    console.log(`  ${r.id}  depth=${r.depth}  vis=${r.visibility}  "${prompt}"`);
  }

  if (!APPLY) {
    console.log(`\n[dry-run] 未删除。确认无误后加 --apply 执行删除。`);
    return;
  }

  const ids = rows.map((r) => r.id);
  const { error: delErr } = await supabase.from('videos').delete().in('id', ids);
  if (delErr) {
    console.error('删除失败:', delErr.message);
    process.exit(1);
  }
  console.log(`\n已删除 ${ids.length} 条坏续写视频。`);
}

main().catch((e) => {
  console.error('异常:', e?.message ?? e);
  process.exit(1);
});
