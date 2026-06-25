export interface MockSample {
  videoUrl: string;
  thumbnailUrl: string;
  durationMs: number;
  width: number;
  height: number;
  tags: string[];
}

// 这些 URL 全部经过实测可访问(media.w3.org / test-videos.co.uk / samplelib / flutter.github.io / w3schools)。
// 不要用 commondatastorage.googleapis.com 上的视频 — 该 bucket 现在返回 403。
export const MOCK_LIBRARY: MockSample[] = [
  {
    videoUrl: 'https://media.w3.org/2010/05/sintel/trailer.mp4',
    thumbnailUrl: 'https://durian.blender.org/wp-content/uploads/2010/06/05.4_comp_002_0098.jpg',
    durationMs: 52_000, width: 480, height: 270,
    tags: ['dragon', '龙', 'fantasy', '奇幻', '冒险'],
  },
  {
    videoUrl: 'https://media.w3.org/2010/05/bunny/trailer.mp4',
    thumbnailUrl: 'https://peach.blender.org/wp-content/uploads/title_anouncement.jpg',
    durationMs: 33_000, width: 640, height: 360,
    tags: ['rabbit', 'cartoon', '兔', '动画', 'cute'],
  },
  {
    videoUrl: 'https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/720/Big_Buck_Bunny_720_10s_1MB.mp4',
    thumbnailUrl: 'https://images.unsplash.com/photo-1518709268805-4e9042af2176?w=640',
    durationMs: 10_000, width: 1280, height: 720,
    tags: ['fire', '火', '燃烧', 'blaze'],
  },
  {
    videoUrl: 'https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/360/Big_Buck_Bunny_360_10s_1MB.mp4',
    thumbnailUrl: 'https://images.unsplash.com/photo-1502920917128-1aa500764cbd?w=640',
    durationMs: 10_000, width: 640, height: 360,
    tags: ['escape', '逃跑', 'run', 'action'],
  },
  {
    videoUrl: 'https://download.samplelib.com/mp4/sample-5s.mp4',
    thumbnailUrl: 'https://images.unsplash.com/photo-1531123897727-8f129e1688ce?w=640',
    durationMs: 5_000, width: 1280, height: 720,
    tags: ['fun', '快乐', 'party', '派对'],
  },
  {
    videoUrl: 'https://download.samplelib.com/mp4/sample-10s.mp4',
    thumbnailUrl: 'https://images.unsplash.com/photo-1502161254066-6c74afbf07aa?w=640',
    durationMs: 10_000, width: 1280, height: 720,
    tags: ['car', '车', 'drive', 'joyride'],
  },
  {
    videoUrl: 'https://flutter.github.io/assets-for-api-docs/assets/videos/bee.mp4',
    thumbnailUrl: 'https://images.unsplash.com/photo-1505761671935-60b3a7427bad?w=640',
    durationMs: 10_000, width: 640, height: 360,
    tags: ['bee', '蜜蜂', 'nature', '自然'],
  },
  {
    videoUrl: 'https://flutter.github.io/assets-for-api-docs/assets/videos/butterfly.mp4',
    thumbnailUrl: 'https://durian.blender.org/wp-content/uploads/2010/06/05.4_comp_002_0098.jpg',
    durationMs: 8_000, width: 640, height: 360,
    tags: ['butterfly', '蝴蝶', 'nature'],
  },
  {
    videoUrl: 'https://www.w3schools.com/html/mov_bbb.mp4',
    thumbnailUrl: 'https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?w=640',
    durationMs: 10_000, width: 320, height: 176,
    tags: ['bunny', '兔', 'classic'],
  },
  {
    videoUrl: 'https://download.samplelib.com/mp4/sample-15s.mp4',
    thumbnailUrl: 'https://mango.blender.org/wp-content/uploads/2012/05/Tears_of_Steel_5sticker.jpg',
    durationMs: 15_000, width: 1280, height: 720,
    tags: ['steel', 'sci-fi', '科幻', '机器人', 'robot', 'cyber'],
  },
];
