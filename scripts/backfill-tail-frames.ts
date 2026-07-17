/**
 * backfill-tail-frames.ts — 给 demo 视频补真实末帧。
 *
 * 用 ffmpeg 抽 assets/videos/001-005.mp4 的末帧 → 传 Supabase Storage thumbnails bucket
 * → 按 prompt 匹配云端 videos 行，回填 tail_frame_url（和 thumbnail_url 若为空也一起填）。
 *
 * 依赖：本机需装 ffmpeg（brew install ffmpeg）。
 *
 * 运行（在你终端，凭证从 env 读，不写进代码）：
 *   SUPABASE_URL=https://<ref>.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=<service_role_key> \
 *   npx tsx scripts/backfill-tail-frames.ts
 */
import { createClient } from '@supabase/supabase-js';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('缺少环境变量 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

// prompt 前缀（用于匹配云端 videos 行）——取每条 demo prompt 的前 40 字符即可唯一
const DEMO = [
  { file: '001.mp4', promptPrefix: 'Dreamworks 3D Animated style. Teal fuzzy octopus' },
  { file: '002.mp4', promptPrefix: 'A female livestreamer is at home, livestreaming' },
  { file: '003.mp4', promptPrefix: 'The cold, sterile observation deck of Sethran' },
  { file: '004.mp4', promptPrefix: 'A high-intensity, cinematic 13-second sequence' },
  { file: '005.mp4', promptPrefix: 'A handsome, athletic Black male soccer player' },
];

const PROJECT_ROOT = path.resolve(__dirname, '..');
const VIDEOS_DIR = path.join(PROJECT_ROOT, 'assets', 'videos');

function ensureFfmpeg() {
  try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); }
  catch { console.error('未找到 ffmpeg，请先 brew install ffmpeg'); process.exit(1); }
}

// 抽视频末帧到临时 jpg，返回临时文件路径
function extractLastFrame(videoPath: string, outPath: string) {
  // -sseof -0.1：定位到结尾前 0.1 秒，取该处一帧
  execFileSync('ffmpeg', ['-y', '-sseof', '-0.1', '-i', videoPath, '-frames:v', '1', '-q:v', '3', outPath], { stdio: 'ignore' });
}

async function main() {
  ensureFfmpeg();
  const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tailframe-'));

  for (const d of DEMO) {
    const videoPath = path.join(VIDEOS_DIR, d.file);
    if (!fs.existsSync(videoPath)) { console.warn(`跳过：${d.file} 不存在`); continue; }

    // 1. 抽末帧
    const framePath = path.join(tmpDir, d.file.replace('.mp4', '.jpg'));
    extractLastFrame(videoPath, framePath);
    console.log(`[抽帧] ${d.file} → ${framePath}`);

    // 2. 传 Storage thumbnails/demo-tail/{file}.jpg
    const storagePath = `demo-tail/${d.file.replace('.mp4', '.jpg')}`;
    const buf = fs.readFileSync(framePath);
    const { error: upErr } = await supabase.storage.from('thumbnails')
      .upload(storagePath, buf, { contentType: 'image/jpeg', upsert: true });
    if (upErr) { console.error(`[上传失败] ${d.file}:`, upErr.message); continue; }
    const { data: urlData } = supabase.storage.from('thumbnails').getPublicUrl(storagePath);
    const frameUrl = urlData.publicUrl;
    console.log(`[上传] ${storagePath}`);

    // 3. 按 prompt 前缀匹配云端 videos 行，回填 tail_frame_url（thumbnail_url 若空也填）
    const { data: rows, error: qErr } = await supabase
      .from('videos').select('id,thumbnail_url')
      .like('prompt', `${d.promptPrefix}%`);
    if (qErr) { console.error(`[查询失败] ${d.file}:`, qErr.message); continue; }
    if (!rows || rows.length === 0) { console.warn(`[未匹配] ${d.file}（prompt 前缀无对应视频）`); continue; }

    for (const row of rows) {
      const patch: Record<string, string> = { tail_frame_url: frameUrl };
      if (!row.thumbnail_url) patch.thumbnail_url = frameUrl;
      const { error: updErr } = await supabase.from('videos').update(patch).eq('id', row.id);
      if (updErr) console.error(`[回填失败] ${row.id}:`, updErr.message);
      else console.log(`[回填] video ${row.id} tail_frame_url ✓`);
    }
  }

  fs.rmSync(tmpDir, { recursive: true, force: true });
  console.log('完成。');
}

main().catch((e) => { console.error('异常:', e); process.exit(1); });
