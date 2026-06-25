import { Asset } from 'expo-asset';

// Demo 阶段的种子视频:打包进 App 的本地资源(assets/videos/*.mp4),
// 配对 demo-assets/prompts/prompts.txt 里的真实 prompt。
// expo-video 的 VideoSource 接受 require() 资源(number),这里用 expo-asset
// 把它解析成稳定的 URI 字符串,从而保持整条管线的 video_url: string 不变。

export interface DemoVideo {
  /** require() 出来的 metro 资源模块。 */
  module: number;
  /** 生成这条视频用的真实 prompt(取自 prompts.txt)。 */
  prompt: string;
  /** 视频时长(毫秒),用于进度条/详情展示。 */
  durationMs: number;
  width: number;
  height: number;
}

// 顺序与 prompts.txt 的 001..005 一致。
export const DEMO_VIDEOS: DemoVideo[] = [
  {
    module: require('../../assets/videos/001.mp4'),
    prompt:
      'Dreamworks 3D Animated style. Teal fuzzy octopus sitting on striped towel slowly raises open book titled "No Shore Thing" back up in front of his face with two tentacles. Movement is deliberate and resigned. Only his eyes remain visible above the top of the pages. Expression of deep tolerance. He disappears behind the book. SFX: soft page rustle, waves, silence. Music off, SFX only.',
    durationMs: 5_000,
    width: 1280,
    height: 720,
  },
  {
    module: require('../../assets/videos/002.mp4'),
    prompt:
      'A female livestreamer is at home, livestreaming and selling products on TikTok. Her tone is excited and animated as she holds up a pair of pants with her left hand. "Okay, be honest… how many sweatpants do you own that actually make you feel put-together?" Butter-soft ribbed knit, 4-way stretch, high waist. From grocery run to coffee date. Link in bio.',
    durationMs: 15_000,
    width: 720,
    height: 1280,
  },
  {
    module: require('../../assets/videos/003.mp4'),
    prompt:
      'The cold, sterile observation deck of Sethran’s flagship. Stars blurred by the ship’s high speed. Eli stands near the window, hands bound by energy cuffs; Sethran paces behind her. Sethran: "You look at me as if I’m a disease." Eli: "I tried to save you! But you wanted it." Sethran: "I loved the power." Eli: "I hate you." Sethran: "I hate you more."',
    durationMs: 12_000,
    width: 1280,
    height: 720,
  },
  {
    module: require('../../assets/videos/004.mp4'),
    prompt:
      'A high-intensity, cinematic 13-second sequence of an extreme surfer tackling a massive towering wave. Third-person chase camera. Hyper-realistic 8k, deep translucent teal water with white chaotic foam, harsh midday sun. The drop-in, freefall and hard bottom turn carving a deep line, entering the glowing green-blue barrel, then bursting out into sunlight with a triumphant arm raised.',
    durationMs: 13_000,
    width: 1280,
    height: 720,
  },
  {
    module: require('../../assets/videos/005.mp4'),
    prompt:
      'A handsome, athletic Black male soccer player on a vibrant pitch. He smiles, walks toward the camera with confident eye contact, then writes "I WILL WIN" with a heart in the foreground space. He forms a heart shape with both hands, winks playfully and blows a kiss. Teammates blurred in the background. Bold handwritten signature stays visible to the last frame.',
    durationMs: 12_000,
    width: 1080,
    height: 1920,
  },
];

// 把 require() 的资源解析成可播放的 URI 字符串。
// 对打包进 App 的本地资源,localUri/uri 在解析后即可直接喂给 expo-video / expo-video-thumbnails。
const uriCache = new Map<number, string>();

export function demoVideoUri(mod: number): string {
  const cached = uriCache.get(mod);
  if (cached) return cached;
  const asset = Asset.fromModule(mod);
  const uri = asset.localUri ?? asset.uri;
  uriCache.set(mod, uri);
  return uri;
}

/** 预下载/解析所有 demo 视频资源,确保首次播放前 localUri 就绪。 */
export async function preloadDemoVideos(): Promise<void> {
  const assets = await Asset.loadAsync(DEMO_VIDEOS.map((v) => v.module));
  assets.forEach((asset, i) => {
    const mod = DEMO_VIDEOS[i]!.module;
    uriCache.set(mod, asset.localUri ?? asset.uri);
  });
}
