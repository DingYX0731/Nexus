import { create } from 'zustand';
import type { EditMetadata, Video } from '@/api/types';
import { DEMO_VIDEOS, demoVideoUri } from '@/ai/demoVideos';

interface LikeMap { [videoId: string]: Set<string> }

interface LocalVideoStore {
  videos: Video[];
  likes: LikeMap;
  hydrate: () => void;
  addVideo: (v: Video) => void;
  toggleLike: (videoId: string, userId: string | null) => boolean;
  bumpStat: (videoId: string, field: 'play_count' | 'fork_count' | 'comment_count', delta?: number) => void;
  setVisibility: (videoId: string, vis: 'public' | 'private') => void;
  deleteVideo: (videoId: string) => void;
}

const seedAuthors = [
  { id: 'seed_alex', username: 'alex_ai', avatar_url: null },
  { id: 'seed_luna', username: 'luna', avatar_url: null },
  { id: 'seed_max', username: 'max', avatar_url: null },
  { id: 'seed_neo', username: 'neo', avatar_url: null },
  { id: 'seed_zoe', username: 'zoe', avatar_url: null },
];

function seedVideos(): Video[] {
  return DEMO_VIDEOS.map((sample, idx) => {
    const id = `seed_${idx}`;
    const author = seedAuthors[idx % seedAuthors.length]!;
    return {
      id,
      author_id: author.id,
      parent_id: null,
      root_id: id,
      remix_kind: null,
      depth: 0,
      title: null,
      prompt: sample.prompt,
      video_url: demoVideoUri(sample.module),
      // 本地视频没有封面图,交给 useVideoThumbnail 抽取首帧。
      thumbnail_url: null,
      tail_frame_url: null,
      duration_ms: sample.durationMs,
      width: sample.width,
      height: sample.height,
      ai_provider: 'mock',
      edit_metadata: null,
      status: 'ready' as const,
      visibility: 'public' as const,
      created_at: new Date(Date.now() - idx * 3_600_000).toISOString(),
      author,
      stats: {
        play_count: 100 + idx * 37,
        like_count: 10 + idx * 5,
        fork_count: idx % 3,
        comment_count: 0,
      },
      is_liked: false,
    };
  });
}

const EMPTY_STATS = { play_count: 0, like_count: 0, fork_count: 0, comment_count: 0 };

export const useLocalVideos = create<LocalVideoStore>((set, get) => ({
  videos: [],
  likes: {},
  hydrate: () => {
    if (get().videos.length === 0) set({ videos: seedVideos() });
  },
  addVideo: (v) => set((state) => ({ videos: [v, ...state.videos] })),
  toggleLike: (videoId, userId) => {
    if (!userId) return false;
    const likes = { ...get().likes };
    const set0 = new Set(likes[videoId] ?? []);
    const wasLiked = set0.has(userId);
    if (wasLiked) set0.delete(userId);
    else set0.add(userId);
    likes[videoId] = set0;
    const videos = get().videos.map((v) => {
      if (v.id !== videoId) return v;
      const cur = v.stats?.like_count ?? 0;
      return {
        ...v,
        is_liked: !wasLiked,
        stats: { ...(v.stats ?? EMPTY_STATS), like_count: cur + (wasLiked ? -1 : 1) },
      };
    });
    set({ likes, videos });
    return !wasLiked;
  },
  bumpStat: (videoId, field, delta = 1) => {
    set((state) => ({
      videos: state.videos.map((v) =>
        v.id === videoId
          ? { ...v, stats: { ...(v.stats ?? EMPTY_STATS), [field]: (v.stats?.[field] ?? 0) + delta } }
          : v,
      ),
    }));
  },
  setVisibility: (videoId, vis) => {
    set((state) => ({
      videos: state.videos.map((v) => v.id === videoId ? { ...v, visibility: vis } : v),
    }));
  },
  deleteVideo: (videoId) => {
    set((state) => ({
      videos: state.videos.filter((v) => v.id !== videoId),
    }));
  },
}));

export function makeNewVideo(args: {
  authorId: string | null;
  authorUsername: string;
  prompt: string;
  parent?: Video;
  remixKind?: 'continuation' | 'prompt_remix' | 'edit';
  videoUrl: string;
  thumbnailUrl?: string;
  tailFrameUrl?: string;
  durationMs?: number;
  width?: number;
  height?: number;
  aiProvider?: string;
  editMetadata?: EditMetadata | null;
}): Video {
  const id = `v_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  const author = { id: args.authorId ?? 'anon', username: args.authorUsername };
  return {
    id,
    author_id: args.authorId,
    parent_id: args.parent?.id ?? null,
    root_id: args.parent?.root_id ?? id,
    remix_kind: args.remixKind ?? null,
    depth: args.parent ? args.parent.depth + 1 : 0,
    title: null,
    prompt: args.prompt,
    video_url: args.videoUrl,
    thumbnail_url: args.thumbnailUrl ?? null,
    tail_frame_url: args.tailFrameUrl ?? args.thumbnailUrl ?? null,
    duration_ms: args.durationMs ?? null,
    width: args.width ?? null,
    height: args.height ?? null,
    ai_provider: args.aiProvider ?? 'mock',
    edit_metadata: args.editMetadata ?? null,
    status: 'ready',
    visibility: 'private', // 新生成的默认是草稿,作者在详情页选择"发布"才进 Feed
    created_at: new Date().toISOString(),
    author,
    stats: { ...EMPTY_STATS },
    is_liked: false,
  };
}
