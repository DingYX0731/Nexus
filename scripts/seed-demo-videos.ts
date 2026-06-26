/**
 * seed-demo-videos.ts
 *
 * 把 5 条 demo 视频（assets/videos/001-005.mp4）上传到 Supabase Storage，
 * 并向 videos 表插入对应的 5 行记录（visibility=public）。
 *
 * 运行方式：
 *   SUPABASE_URL=https://<project>.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=<service_role_key> \
 *   npx tsx scripts/seed-demo-videos.ts
 *
 * 注意：
 *   - 需要 SUPABASE_URL 和 SUPABASE_SERVICE_ROLE_KEY 环境变量（不要硬编码）。
 *   - 使用 service role key（绕过 RLS），仅在服务端/本地 seed 时使用。
 *   - 幂等：重复运行会先按 video_url 删除旧 seed 行再重新插入。
 *   - 需要先跑 supabase 的 migrations 初始化表结构。
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'node:fs';
import * as path from 'node:path';

// ── 从环境变量读取，绝不硬编码 ─────────────────────────────────────────────
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error(
    '[seed] 缺少环境变量：\n' +
    '  SUPABASE_URL=https://<project>.supabase.co\n' +
    '  SUPABASE_SERVICE_ROLE_KEY=<service_role_key>\n',
  );
  process.exit(1);
}

// ── demo 视频元数据（对应 src/ai/demoVideos.ts 的 DEMO_VIDEOS）────────────
interface DemoEntry {
  filename: string;  // assets/videos/ 目录下的文件名
  prompt: string;
  durationMs: number;
  width: number;
  height: number;
}

const DEMO_ENTRIES: DemoEntry[] = [
  {
    filename: '001.mp4',
    prompt:
      'Dreamworks 3D Animated style. Teal fuzzy octopus sitting on striped towel slowly raises open book titled "No Shore Thing" back up in front of his face with two tentacles. Movement is deliberate and resigned. Only his eyes remain visible above the top of the pages. Expression of deep tolerance. He disappears behind the book. SFX: soft page rustle, waves, silence. Music off, SFX only.',
    durationMs: 5_000,
    width: 1280,
    height: 720,
  },
  {
    filename: '002.mp4',
    prompt:
      'A female livestreamer is at home, livestreaming and selling products on TikTok. Her tone is excited and animated as she holds up a pair of pants with her left hand. "Okay, be honest… how many sweatpants do you own that actually make you feel put-together?" Butter-soft ribbed knit, 4-way stretch, high waist. From grocery run to coffee date. Link in bio.',
    durationMs: 15_000,
    width: 720,
    height: 1280,
  },
  {
    filename: '003.mp4',
    prompt:
      'The cold, sterile observation deck of Sethran\'s flagship. Stars blurred by the ship\'s high speed. Eli stands near the window, hands bound by energy cuffs; Sethran paces behind her. Sethran: "You look at me as if I\'m a disease." Eli: "I tried to save you! But you wanted it." Sethran: "I loved the power." Eli: "I hate you." Sethran: "I hate you more."',
    durationMs: 12_000,
    width: 1280,
    height: 720,
  },
  {
    filename: '004.mp4',
    prompt:
      'A high-intensity, cinematic 13-second sequence of an extreme surfer tackling a massive towering wave. Third-person chase camera. Hyper-realistic 8k, deep translucent teal water with white chaotic foam, harsh midday sun. The drop-in, freefall and hard bottom turn carving a deep line, entering the glowing green-blue barrel, then bursting out into sunlight with a triumphant arm raised.',
    durationMs: 13_000,
    width: 1280,
    height: 720,
  },
  {
    filename: '005.mp4',
    prompt:
      'A handsome, athletic Black male soccer player on a vibrant pitch. He smiles, walks toward the camera with confident eye contact, then writes "I WILL WIN" with a heart in the foreground space. He forms a heart shape with both hands, winks playfully and blows a kiss. Teammates blurred in the background. Bold handwritten signature stays visible to the last frame.',
    durationMs: 12_000,
    width: 1080,
    height: 1920,
  },
];

const STORAGE_BUCKET = 'videos';
// 脚本所在目录的上一层（项目根目录）
const PROJECT_ROOT = path.resolve(__dirname, '..');
const ASSETS_VIDEOS_DIR = path.join(PROJECT_ROOT, 'assets', 'videos');

async function main() {
  const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });

  console.log('[seed] 连接到 Supabase:', SUPABASE_URL);

  for (const entry of DEMO_ENTRIES) {
    const localPath = path.join(ASSETS_VIDEOS_DIR, entry.filename);
    if (!fs.existsSync(localPath)) {
      console.warn(`[seed] 跳过：文件不存在 ${localPath}`);
      continue;
    }

    const storagePath = `demo/${entry.filename}`;

    // ── 1. 上传到 Storage ────────────────────────────────────────────────────
    console.log(`[seed] 上传 ${entry.filename} → storage://${STORAGE_BUCKET}/${storagePath}`);
    const fileBuffer = fs.readFileSync(localPath);
    const { error: uploadError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(storagePath, fileBuffer, {
        contentType: 'video/mp4',
        upsert: true, // 幂等：已存在则覆盖
      });

    if (uploadError) {
      console.error(`[seed] 上传失败 ${entry.filename}:`, uploadError.message);
      continue;
    }

    // ── 2. 取得公开 URL ─────────────────────────────────────────────────────
    const { data: urlData } = supabase.storage
      .from(STORAGE_BUCKET)
      .getPublicUrl(storagePath);
    const videoUrl = urlData.publicUrl;
    console.log(`[seed] 公开 URL: ${videoUrl}`);

    // ── 3. 向 videos 表插入 ──────────────────────────────────────────────────
    // 幂等：先按 video_url 删掉旧的 seed 行，再插入。
    // （video_url 列无 unique 约束，故不能用 onConflict upsert。）
    await supabase.from('videos').delete().eq('video_url', videoUrl);

    // seed 视频是根节点：预生成 id，root_id 自引用（root_id 列 not null）。
    const id = crypto.randomUUID();
    const { error: insertError } = await supabase
      .from('videos')
      .insert({
        id,
        author_id: null,       // seed 视频无归属用户
        prompt: entry.prompt,
        video_url: videoUrl,
        thumbnail_url: null,
        tail_frame_url: null,
        duration_ms: entry.durationMs,
        width: entry.width,
        height: entry.height,
        ai_provider: 'doubao',
        visibility: 'public',
        status: 'ready',
        depth: 0,
        parent_id: null,
        root_id: id,           // 自引用：根节点
        remix_kind: null,
        edit_metadata: null,
      });

    if (insertError) {
      console.error(`[seed] 插入 videos 表失败 ${entry.filename}:`, insertError.message);
    } else {
      console.log(`[seed] ✓ ${entry.filename} 入库成功`);
    }
  }

  console.log('[seed] 完成。');
}

main().catch((err) => {
  console.error('[seed] 未预期错误:', err);
  process.exit(1);
});
