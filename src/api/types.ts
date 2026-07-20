export type RemixKind = 'continuation' | 'prompt_remix';

export interface Author {
  id: string;
  username: string;
  avatar_url?: string | null;
}

export interface VideoStats {
  play_count: number;
  like_count: number;
  fork_count: number;
  comment_count: number;
}

export interface Video {
  id: string;
  author_id: string | null;
  parent_id: string | null;
  root_id: string;
  remix_kind: RemixKind | null;
  depth: number;
  title?: string | null;
  prompt: string;
  video_url: string;
  thumbnail_url?: string | null;
  tail_frame_url?: string | null;
  duration_ms?: number | null;
  width?: number | null;
  height?: number | null;
  ai_provider?: string | null;
  status: 'generating' | 'ready' | 'failed';
  /** private = 草稿(只在自己个人页可见);public = 已发布(进 Feed) */
  visibility: 'private' | 'public';
  created_at: string;
  author?: Author | null;
  stats?: VideoStats;
  is_liked?: boolean;
}

export interface VersionNode {
  id: string;
  parent_id: string | null;
  root_id: string;
  remix_kind: RemixKind | null;
  depth: number;
  prompt?: string | null;
  author_username?: string | null;
  author_avatar_url?: string | null;
  thumbnail_url?: string | null;
  created_at: string;
}

export interface AuthUser {
  id: string;
  username: string;
  avatar_url?: string | null;
}
