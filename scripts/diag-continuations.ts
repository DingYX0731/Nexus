/**
 * diag-continuations.ts — 诊断续写视频的实际数据库状态。
 * 只读，不改任何数据。
 *
 * 运行（凭证从 env 读，别贴聊天）：
 *   SUPABASE_URL=https://<ref>.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=<service_role_key> \
 *   npx tsx scripts/diag-continuations.ts
 */
import { createClient } from '@supabase/supabase-js';

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) { console.error('缺少 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }

async function main() {
  const sb = createClient(URL!, KEY!, { auth: { persistSession: false } });
  // 最近 30 条视频全貌
  const { data, error } = await sb
    .from('videos')
    .select('id,author_id,parent_id,root_id,depth,remix_kind,status,visibility,tail_frame_url,video_url,created_at')
    .order('created_at', { ascending: false })
    .limit(30);
  if (error) { console.error('查询失败:', error.message); process.exit(1); }

  console.log(`最近 ${data!.length} 条视频：\n`);
  for (const v of data!) {
    const short = (s: string | null) => (s ? s.slice(0, 8) : '—');
    console.log(
      `${short(v.id)} depth=${v.depth} kind=${v.remix_kind ?? 'root'} status=${v.status} vis=${v.visibility} ` +
      `parent=${short(v.parent_id)} tail=${v.tail_frame_url ? 'Y' : 'N'} url=${v.video_url ? 'Y' : 'EMPTY'} @${short(v.author_id)}`,
    );
  }

  // 按 status 分组统计
  const byStatus: Record<string, number> = {};
  for (const v of data!) byStatus[v.status] = (byStatus[v.status] ?? 0) + 1;
  console.log('\n状态分布：', byStatus);

  // 续写视频专项
  const conts = data!.filter((v) => v.remix_kind === 'continuation');
  console.log(`\n续写视频 ${conts.length} 条：`);
  for (const v of conts) {
    console.log(`  ${v.id}  status=${v.status}  vis=${v.visibility}  parent=${v.parent_id?.slice(0,8)}  video_url=${v.video_url ? 'has' : 'EMPTY'}`);
  }
}
main().catch((e) => { console.error('异常:', e?.message ?? e); process.exit(1); });
