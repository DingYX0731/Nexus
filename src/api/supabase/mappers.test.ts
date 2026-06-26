import { describe, it, expect } from 'vitest';
import { rowToVideo, rowToComment } from './mappers';
import type { VideoWithStatsRow, CommentRow } from './rows';

const baseRow: VideoWithStatsRow = {
  id: 'v1', author_id: 'u1', parent_id: null, root_id: 'v1',
  remix_kind: null, depth: 0, prompt: 'hi', video_url: 'http://x/v.mp4',
  thumbnail_url: null, tail_frame_url: null, duration_ms: 5000,
  width: 720, height: 1280, ai_provider: 'doubao', edit_metadata: null,
  status: 'ready', visibility: 'public', play_count: 12, created_at: '2026-06-24T00:00:00Z',
  like_count: 3, comment_count: 2, fork_count: 1,
  author: { id: 'u1', username: 'alex', avatar_url: null, created_at: '2026-06-24T00:00:00Z' },
};

describe('rowToVideo', () => {
  it('maps core fields', () => {
    const v = rowToVideo(baseRow);
    expect(v.id).toBe('v1');
    expect(v.video_url).toBe('http://x/v.mp4');
    expect(v.author?.username).toBe('alex');
  });
  it('maps stats from view counts', () => {
    const v = rowToVideo(baseRow);
    expect(v.stats).toEqual({ play_count: 12, like_count: 3, fork_count: 1, comment_count: 2 });
  });
  it('coerces remix_kind null', () => {
    expect(rowToVideo(baseRow).remix_kind).toBeNull();
  });
});

describe('rowToComment', () => {
  it('maps body to text and author name', () => {
    const row: CommentRow = {
      id: 'c1', video_id: 'v1', author_id: 'u1', parent_id: null, body: 'nice', created_at: '2026-06-24T00:00:00Z',
      author: { id: 'u1', username: 'alex', avatar_url: null, created_at: '2026-06-24T00:00:00Z' },
    };
    const c = rowToComment(row);
    expect(c.text).toBe('nice');
    expect(c.authorName).toBe('alex');
    expect(c.videoId).toBe('v1');
    expect(c.replyToName).toBeNull();
  });
  it('maps reply_to_name when present', () => {
    const row: CommentRow = {
      id: 'c2', video_id: 'v1', author_id: 'u2', parent_id: 'c1', body: 'thanks', created_at: '2026-06-24T01:00:00Z',
      reply_to_name: 'alex',
      author: { id: 'u2', username: 'bob', avatar_url: null, created_at: '2026-06-24T00:00:00Z' },
    };
    const c = rowToComment(row);
    expect(c.replyToName).toBe('alex');
    expect(c.parentId).toBe('c1');
  });
});
