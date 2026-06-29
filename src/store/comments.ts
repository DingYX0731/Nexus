import { create } from 'zustand';
import { hasSupabase } from '@/api/client';
import { listCommentsRemote, addCommentRemote } from '@/api/supabase/commentsRepo';

export interface Comment {
  id: string;
  videoId: string;
  authorId: string;
  authorName: string;
  authorAvatarColor: string;
  text: string;
  createdAt: number;
  likeCount: number;
  liked: boolean;
  parentId: string | null;
  replyCount: number;
  replyToName?: string | null;
  authorAvatarUrl?: string | null;
}

interface CommentsStore {
  byVideo: Record<string, Comment[]>;
  ensureSeeded: (videoId: string) => void;
  add: (videoId: string, text: string, parentId: string | null, author: { id: string; name: string }, replyToName?: string | null) => Comment;
  toggleLike: (videoId: string, commentId: string) => void;
}

const AVATAR_COLORS = ['#fe2c55', '#25f4ee', '#ff6b9d', '#7ad7ff', '#ffd166', '#a06cd5', '#8ad27a', '#ff9f7a'];
const SEED_NAMES = ['小红', '李雷', '韩梅梅', '阿汤', '夏目', 'kira', 'echo', '北方', '阿七', '糖糖'];
const SEED_TEXTS = [
  '太治愈了!希望能多刷到这种风格的视频',
  '画面感真不错,prompt 是怎么写的呀',
  '哈哈哈这个 idea 我也想过,可惜不会用 AI',
  '上次刷到一个类似的更厉害,等我去找',
  '续写一下加个反转剧情就完美了',
  '这种风格我能看一晚上',
  '画质感觉还能再细腻一点',
  '蹲个剪辑版,配点 bgm 应该更带感',
  '居然不是真人拍的吗???',
  '这个赛博朋克味儿出来了',
];
const SEED_REPLIES = [
  '同感同感!',
  '哈哈哈我也是',
  '一起蹲',
  '这就续写一个',
  '+1',
];

let _idSeq = 1;
const nextId = () => `c_${_idSeq++}`;

function seedFor(videoId: string): Comment[] {
  const count = 4 + ((videoId.length * 7) % 6); // 4-9 条
  const out: Comment[] = [];
  for (let i = 0; i < count; i++) {
    const nameIdx = (videoId.charCodeAt(0) + i * 3) % SEED_NAMES.length;
    const textIdx = (videoId.charCodeAt(0) * 5 + i) % SEED_TEXTS.length;
    const colorIdx = (nameIdx + i) % AVATAR_COLORS.length;
    const parent: Comment = {
      id: nextId(),
      videoId,
      authorId: `seed_${nameIdx}_${i}`,
      authorName: SEED_NAMES[nameIdx]!,
      authorAvatarColor: AVATAR_COLORS[colorIdx]!,
      text: SEED_TEXTS[textIdx]!,
      createdAt: Number.parseInt(String(new Date(2025, 0, 1).valueOf()), 10) - i * 60_000 - (videoId.length * 100_000),
      likeCount: ((i * 11 + nameIdx * 3) % 47),
      liked: false,
      parentId: null,
      replyCount: 0,
    };
    out.push(parent);
    // 一两条加 1-2 个嵌套回复
    if (i % 3 === 1) {
      const replyCount = 1 + (i % 2);
      for (let r = 0; r < replyCount; r++) {
        const rNameIdx = (nameIdx + r + 4) % SEED_NAMES.length;
        out.push({
          id: nextId(),
          videoId,
          authorId: `seed_${rNameIdx}_r${i}_${r}`,
          authorName: SEED_NAMES[rNameIdx]!,
          authorAvatarColor: AVATAR_COLORS[(rNameIdx + 2) % AVATAR_COLORS.length]!,
          text: SEED_REPLIES[(r + i) % SEED_REPLIES.length]!,
          createdAt: parent.createdAt + (r + 1) * 30_000,
          likeCount: (r + 1) * 2,
          liked: false,
          parentId: parent.id,
          replyCount: 0,
        });
      }
      parent.replyCount = replyCount;
    }
  }
  return out;
}

export const useComments = create<CommentsStore>((set, get) => ({
  byVideo: {},
  ensureSeeded: (videoId) => {
    if (get().byVideo[videoId]) return;
    if (hasSupabase) {
      // Kick off async fetch; populate byVideo when resolved
      listCommentsRemote(videoId)
        .then((comments) => {
          set((s) => ({ byVideo: { ...s.byVideo, [videoId]: comments } }));
        })
        .catch(() => {
          // Fallback to local seed on error
          set((s) => ({ byVideo: { ...s.byVideo, [videoId]: seedFor(videoId) } }));
        });
      // Optimistically set empty array so we don't re-trigger while fetching
      set((s) => ({ byVideo: { ...s.byVideo, [videoId]: s.byVideo[videoId] ?? [] } }));
    } else {
      set((s) => ({ byVideo: { ...s.byVideo, [videoId]: seedFor(videoId) } }));
    }
  },
  add: (videoId, text, parentId, author, replyToName) => {
    const c: Comment = {
      id: nextId(),
      videoId,
      authorId: author.id,
      authorName: author.name,
      authorAvatarColor: AVATAR_COLORS[author.name.length % AVATAR_COLORS.length]!,
      text,
      createdAt: new Date().valueOf(),
      likeCount: 0,
      liked: false,
      parentId,
      replyCount: 0,
      replyToName: replyToName ?? null,
    };
    if (hasSupabase) {
      addCommentRemote(videoId, text, author.id, parentId, replyToName ?? null)
        .then((remote) => {
          set((s) => {
            const cur = s.byVideo[videoId] ?? [];
            // Replace the optimistic entry with the remote one
            const withoutOptimistic = cur.filter((x) => x.id !== c.id);
            const next = parentId
              ? withoutOptimistic.concat(remote)
              : [remote, ...withoutOptimistic];
            return { byVideo: { ...s.byVideo, [videoId]: next } };
          });
        })
        .catch(() => {
          // Keep the optimistic local entry on error (already added below)
        });
    }
    // Optimistically add locally (so UI is immediate)
    set((s) => {
      const cur = s.byVideo[videoId] ?? [];
      const next = parentId
        ? cur.map((x) => (x.id === parentId ? { ...x, replyCount: x.replyCount + 1 } : x)).concat(c)
        : [c, ...cur];
      return { byVideo: { ...s.byVideo, [videoId]: next } };
    });
    return c;
  },
  toggleLike: (videoId, commentId) => {
    set((s) => {
      const cur = s.byVideo[videoId] ?? [];
      return {
        byVideo: {
          ...s.byVideo,
          [videoId]: cur.map((c) =>
            c.id === commentId
              ? { ...c, liked: !c.liked, likeCount: c.likeCount + (c.liked ? -1 : 1) }
              : c,
          ),
        },
      };
    });
  },
}));

export function totalCommentCount(comments: Comment[]): number {
  return comments.length;
}
