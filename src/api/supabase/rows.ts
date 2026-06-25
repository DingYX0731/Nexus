export interface ProfileRow {
  id: string;
  username: string;
  avatar_url: string | null;
  created_at: string;
}

export interface VideoRow {
  id: string;
  author_id: string | null;
  parent_id: string | null;
  root_id: string;
  remix_kind: string | null;
  depth: number;
  prompt: string;
  video_url: string;
  thumbnail_url: string | null;
  tail_frame_url: string | null;
  duration_ms: number | null;
  width: number | null;
  height: number | null;
  ai_provider: string | null;
  edit_metadata: unknown | null;
  status: string;
  visibility: string;
  play_count: number;
  created_at: string;
}

export interface VideoWithStatsRow extends VideoRow {
  like_count: number;
  comment_count: number;
  fork_count: number;
  // join 出来的作者资料（可选）
  author?: ProfileRow | null;
}

export interface CommentRow {
  id: string;
  video_id: string;
  author_id: string | null;
  body: string;
  created_at: string;
  author?: ProfileRow | null;
}
