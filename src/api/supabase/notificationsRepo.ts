import { supabase } from '@/api/client';
import { useAuth } from '@/store/auth';
import { rowToNotification, type NotificationItem } from './notificationMapper';
import type { NotificationRow } from './rows';

const SELECT = '*, actor:profiles!notifications_actor_id_fkey(*)';

export async function listNotificationsRemote(): Promise<NotificationItem[]> {
  const { data, error } = await supabase()
    .from('notifications').select(SELECT)
    .order('created_at', { ascending: false }).limit(50);
  if (error) throw error;
  return (data as NotificationRow[]).map(rowToNotification);
}

export async function markAllReadRemote(): Promise<void> {
  const uid = useAuth.getState().user?.id;
  if (!uid) return;
  await supabase().from('notifications').update({ read: true }).eq('user_id', uid).eq('read', false);
}

export async function unreadCountRemote(): Promise<number> {
  const uid = useAuth.getState().user?.id;
  if (!uid) return 0;
  const { count } = await supabase()
    .from('notifications').select('*', { count: 'exact', head: true })
    .eq('user_id', uid).eq('read', false);
  return count ?? 0;
}
