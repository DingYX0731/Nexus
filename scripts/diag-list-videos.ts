/**
 * diag-list-videos.ts — 只读：列出当前账号的所有视频及状态。
 * 用于排查"主页多出视频/打不开"问题。
 *
 *   EXPO_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co \
 *   EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon_key> \
 *   DIAG_EMAIL=<邮箱> DIAG_PASSWORD=<密码> \
 *   npx tsx scripts/diag-list-videos.ts
 */
import { createClient } from '@supabase/supabase-js';

const URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const ANON = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const EMAIL = process.env.DIAG_EMAIL;
const PASSWORD = process.env.DIAG_PASSWORD;

if (!URL || !ANON || !EMAIL || !PASSWORD) {
  console.error('缺少环境变量 EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY / DIAG_EMAIL / DIAG_PASSWORD');
  process.exit(1);
}

async function main() {
  const supabase = createClient(URL!, ANON!, { auth: { persistSession: false } });
  const { data: auth, error: authErr } = await supabase.auth.signInWithPassword({
    email: EMAIL!, password: PASSWORD!,
  });
  if (authErr) { console.error('登录失败:', authErr.message); process.exit(1); }
  const uid = auth.user!.id;
  console.log('[diag] user:', uid, '\n');

  const { data, error } = await supabase
    .from('videos')
    .select('id,prompt,status,visibility,video_url,doubao_task_id,created_at')
    .eq('author_id', uid)
    .order('created_at', { ascending: false });
  if (error) { console.error('查询失败:', error.message); process.exit(1); }

  console.log(`[diag] 你的视频共 ${data?.length ?? 0} 条:\n`);
  for (const v of data ?? []) {
    const hasUrl = v.video_url && v.video_url.length > 0;
    console.log(`  id=${v.id.slice(0, 8)}  status=${v.status}  vis=${v.visibility}  url=${hasUrl ? 'OK' : '【空!】'}  task=${v.doubao_task_id ? v.doubao_task_id.slice(0, 8) : 'none'}`);
    console.log(`     prompt: ${(v.prompt ?? '').slice(0, 40)}`);
    console.log(`     created: ${v.created_at}\n`);
  }
}

main().catch((e) => { console.error('异常:', e); process.exit(1); });
