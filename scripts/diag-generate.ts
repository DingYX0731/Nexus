/**
 * diag-generate.ts — 诊断异步生成链路。
 *
 * 用你的账号登录拿 token，调 generate-video 发起，再轮询 poll-video，
 * 打印每一步的完整状态码 + 响应体。绕过 App，直接看 Edge Function 真实返回。
 *
 * 运行（在你终端，凭证不写进代码）：
 *   EXPO_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co \
 *   EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon_key> \
 *   DIAG_EMAIL=<你的登录邮箱> \
 *   DIAG_PASSWORD=<你的登录密码> \
 *   npx tsx scripts/diag-generate.ts
 */
import { createClient } from '@supabase/supabase-js';

const URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const ANON = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const EMAIL = process.env.DIAG_EMAIL;
const PASSWORD = process.env.DIAG_PASSWORD;

if (!URL || !ANON || !EMAIL || !PASSWORD) {
  console.error('缺少环境变量：EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY / DIAG_EMAIL / DIAG_PASSWORD');
  process.exit(1);
}

async function main() {
  const supabase = createClient(URL!, ANON!, { auth: { persistSession: false } });

  console.log('[diag] 登录中...');
  const { data: auth, error: authErr } = await supabase.auth.signInWithPassword({
    email: EMAIL!, password: PASSWORD!,
  });
  if (authErr) { console.error('[diag] 登录失败:', authErr.message); process.exit(1); }
  const token = auth.session?.access_token;
  console.log('[diag] 登录成功, user:', auth.user?.id);

  const callRaw = async (fn: string, body: unknown) => {
    const res = await fetch(`${URL}/functions/v1/${fn}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: ANON!,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    console.log(`[diag] ${fn} → HTTP ${res.status}`);
    console.log(`[diag] ${fn} 响应体:`, text.slice(0, 500));
    try { return JSON.parse(text); } catch { return null; }
  };

  console.log('\n[diag] === 第一段：generate-video 发起 ===');
  const start = await callRaw('generate-video', {
    kind: 'text', prompt: '一只橘猫在屋顶看星星，电影感', aspect: '9:16',
  });
  const videoId = start?.videoId;
  if (!videoId) { console.error('[diag] 未拿到 videoId，发起失败，停止。'); process.exit(1); }
  console.log('[diag] videoId:', videoId);

  console.log('\n[diag] === 第二段：poll-video 轮询（最多 30 次 × 5s）===');
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    const poll = await callRaw('poll-video', { videoId });
    const status = poll?.status;
    console.log(`[diag] 第 ${i + 1} 次轮询 status=${status}`);
    if (status === 'ready') { console.log('[diag] ✓ 生成成功！'); break; }
    if (status === 'failed') { console.log('[diag] ✗ 生成失败:', poll?.error); break; }
  }
  console.log('[diag] 完成。');
}

main().catch((e) => { console.error('[diag] 异常:', e); process.exit(1); });
