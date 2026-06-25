import type {
  AiJob,
  ImageToVideoInput,
  TextToVideoInput,
  VideoGenProvider,
} from './types';

// Kling Provider — M2 里实现。当前作为接口占位,被调用时抛错引导切回 Mock。
//
// 集成要点(实施时填):
//   1. 通过 Edge Function 中转 KLING_API_KEY,客户端不直接持密钥
//   2. POST {KLING_HOST}/v1/videos/text2video    入参: prompt, aspect_ratio, duration
//   3. POST {KLING_HOST}/v1/videos/image2video   入参: image_url, prompt, duration
//   4. GET  {KLING_HOST}/v1/videos/jobs/{task_id} 轮询 status
//   5. status 映射: submitted/processing → queued/running;succeed → succeeded; failed → failed
//   6. 成功时把 task_result.videos[0] 的 url/cover_image_url 保存到 Storage 后再写入 videos 表
export const KlingProvider: VideoGenProvider = {
  name: 'kling',

  async textToVideo(_input: TextToVideoInput) {
    throw new Error('KlingProvider 尚未实现,M2 接入。当前请使用 MockProvider。');
  },

  async imageToVideo(_input: ImageToVideoInput) {
    throw new Error('KlingProvider 尚未实现,M2 接入。当前请使用 MockProvider。');
  },

  async getJob(_jobId: string): Promise<AiJob> {
    throw new Error('KlingProvider 尚未实现,M2 接入。当前请使用 MockProvider。');
  },
};
