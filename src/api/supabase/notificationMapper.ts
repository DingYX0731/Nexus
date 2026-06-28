import type { NotificationRow } from './rows';

export interface NotificationItem {
  id: string;
  type: string;            // like | comment | fork | follow
  actorName: string;
  actorAvatarUrl: string | null;
  videoId: string | null;
  createdAt: number;
  read: boolean;
}

export function rowToNotification(row: NotificationRow): NotificationItem {
  return {
    id: row.id,
    type: row.type,
    actorName: row.actor?.username ?? '已注销用户',
    actorAvatarUrl: row.actor?.avatar_url ?? null,
    videoId: row.video_id,
    createdAt: new Date(row.created_at).getTime(),
    read: row.read,
  };
}
