// 本地一次性测试脚本,用 ts-node 直接跑:验证 DoubaoProvider 模块按预期工作。
// 不会接入 React Native 运行时,只是测我们的封装。
//
// 使用:
//   EXPO_PUBLIC_DOUBAO_API_KEY=sk-... npx tsx scripts/test-doubao-provider.ts
//
// 跑完应该看到 "✅ provider 端到端 OK,videoUrl = https://..."
// 别频繁跑,每次烧 ~25 万 tokens。

import { DoubaoProvider } from '../src/ai/DoubaoProvider';

async function main() {
  console.log('1) textToVideo: 创建任务...');
  const { jobId } = await DoubaoProvider.textToVideo({
    prompt: '一只可爱的小猫在阳光下打哈欠',
    aspect: '9:16',
    durationSec: 5,
  });
  console.log(`   jobId = ${jobId}`);

  console.log('2) 轮询状态...');
  const start = Date.now();
  while (true) {
    const job = await DoubaoProvider.getJob(jobId);
    const elapsed = Math.round((Date.now() - start) / 1000);
    console.log(`   [t=${elapsed}s] status=${job.status}`);
    if (job.status === 'succeeded') {
      console.log(`✅ provider 端到端 OK,videoUrl = ${job.videoUrl}`);
      console.log(`   durationMs=${job.durationMs}, size=${job.width}x${job.height}`);
      return;
    }
    if (job.status === 'failed') {
      console.error(`❌ 失败: ${job.error}`);
      process.exit(1);
    }
    if (elapsed > 240) {
      console.error('❌ 超过 4 分钟,放弃');
      process.exit(1);
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
}

main().catch((e) => {
  console.error('❌ exception:', e?.message ?? e);
  process.exit(1);
});
