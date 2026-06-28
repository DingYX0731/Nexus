import { describe, it, expect } from 'vitest';
import { rowToNotification } from './notificationMapper';
import type { NotificationRow } from './rows';

const base: NotificationRow = {
  id: 'n1', user_id: 'u1', actor_id: 'u2', type: 'like',
  video_id: 'v1', comment_id: null, read: false, created_at: '2026-06-26T00:00:00Z',
  actor: { id: 'u2', username: 'luna', avatar_url: null, created_at: '2026-06-26T00:00:00Z' },
};

describe('rowToNotification', () => {
  it('maps core fields', () => {
    const n = rowToNotification(base);
    expect(n.id).toBe('n1');
    expect(n.type).toBe('like');
    expect(n.actorName).toBe('luna');
    expect(n.videoId).toBe('v1');
    expect(n.read).toBe(false);
  });
  it('handles missing actor', () => {
    const n = rowToNotification({ ...base, actor: null, actor_id: null });
    expect(n.actorName).toBe('已注销用户');
  });
  it('maps created_at to epoch ms', () => {
    expect(rowToNotification(base).createdAt).toBe(new Date(base.created_at).getTime());
  });
});
