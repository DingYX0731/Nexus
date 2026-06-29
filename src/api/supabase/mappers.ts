import type { Video, Author, RemixKind, EditMetadata } from '@/api/types';
import type { Comment } from '@/store/comments';
import type { VideoWithStatsRow, CommentRow, ProfileRow } from './rows';

const AVATAR_COLORS = ['#fe2c55', '#25f4ee', '#ff6b9d', '#7ad7ff', '#ffd166', '#a06cd5', '#8ad27a', '#ff9f7a'];

function colorFor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length]!;
}

function profileToAuthor(p?: ProfileRow | null, fallbackId?: string | null): Author | null {
  if (p) return { id: p.id, username: p.username, avatar_url: p.avatar_url };
  if (fallbackId) return { id: fallbackId, username: '已注销用户', avatar_url: null };
  return null;
}

export function rowToVideo(row: VideoWithStatsRow): Video {
  return {
    id: row.id,
    author_id: row.author_id,
    parent_id: row.parent_id,
    root_id: row.root_id,
    remix_kind: (row.remix_kind as RemixKind | null) ?? null,
    depth: row.depth,
    title: null,
    prompt: row.prompt,
    video_url: row.video_url,
    thumbnail_url: row.thumbnail_url,
    tail_frame_url: row.tail_frame_url,
    duration_ms: row.duration_ms,
    width: row.width,
    height: row.height,
    ai_provider: row.ai_provider,
    edit_metadata: (row.edit_metadata as EditMetadata | null) ?? null,
    status: row.status as Video['status'],
    visibility: row.visibility as Video['visibility'],
    created_at: row.created_at,
    author: profileToAuthor(row.author, row.author_id),
    stats: {
      play_count: row.play_count,
      like_count: row.like_count,
      fork_count: row.fork_count,
      comment_count: row.comment_count,
    },
    is_liked: false, // 由仓库层根据当前用户单独填充
  };
}

export function rowToComment(row: CommentRow): Comment {
  const name = row.author?.username ?? '匿名用户';
  return {
    id: row.id,
    videoId: row.video_id,
    authorId: row.author_id ?? 'anon',
    authorName: name,
    authorAvatarColor: colorFor(row.author_id ?? row.id),
    text: row.body,
    createdAt: new Date(row.created_at).getTime(),
    likeCount: 0,
    liked: false,
    parentId: row.parent_id ?? null,
    replyCount: 0,
    replyToName: row.reply_to_name ?? null,
    authorAvatarUrl: row.author?.avatar_url ?? null,
  };
}
