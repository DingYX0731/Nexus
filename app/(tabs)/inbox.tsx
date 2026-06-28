import { useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Bell, Heart, GitBranch, MessageCircle, UserPlus } from 'lucide-react-native';
import { useFocusEffect } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { colors, radius, spacing, typography } from '@/theme';
import { useTabBarSpace } from '@/hooks/useTabBarSpace';
import { hasSupabase } from '@/api/client';
import { listNotificationsRemote, markAllReadRemote } from '@/api/supabase/notificationsRepo';
import type { NotificationItem } from '@/api/supabase/notificationMapper';
import { LoadingState, ErrorState, EmptyState } from '@/components/ui/ScreenState';
import { UserAvatar } from '@/components/ui/UserAvatar';

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function timeAgo(ms: number): string {
  const diff = Date.now() - ms;
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes}分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}小时前`;
  const days = Math.floor(hours / 24);
  return `${days}天前`;
}

const ACTION_TEXT: Record<string, string> = {
  like: '赞了你的视频',
  comment: '评论了你的视频',
  fork: '续写了你的视频',
  follow: '关注了你',
};

const ICONS: Record<string, React.ReactNode> = {
  fork: <GitBranch color={colors.accent} size={18} />,
  like: <Heart color={colors.primary} size={18} fill={colors.primary} />,
  comment: <MessageCircle color={colors.text} size={18} />,
  follow: <UserPlus color={colors.success} size={18} />,
};

// ---------------------------------------------------------------------------
// NotificationRow
// ---------------------------------------------------------------------------

function NotificationRow({ item }: { item: NotificationItem }) {
  const actionText = ACTION_TEXT[item.type] ?? item.type;
  return (
    <View style={[styles.row, !item.read && styles.rowUnread]}>
      <View style={styles.iconBg}>{ICONS[item.type] ?? null}</View>
      <UserAvatar
        user={{ username: item.actorName, avatar_url: item.actorAvatarUrl }}
        size={36}
      />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.body}>
          <Text style={styles.who}>@{item.actorName} </Text>
          <Text style={styles.what}>{actionText}</Text>
        </Text>
        <Text style={styles.when}>{timeAgo(item.createdAt)}</Text>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function InboxScreen() {
  const { contentBottomPad } = useTabBarSpace();
  const qc = useQueryClient();

  // Only fetch when Supabase is configured
  const {
    data: notifications = [],
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['notifications'],
    queryFn: listNotificationsRemote,
    enabled: hasSupabase,
  });

  // Mark all read when screen is focused
  useFocusEffect(
    useCallback(() => {
      if (!hasSupabase) return;
      markAllReadRemote().then(() => {
        qc.invalidateQueries({ queryKey: ['notifications'] });
        qc.invalidateQueries({ queryKey: ['unreadCount'] });
      });
    }, [qc]),
  );

  const header = (
    <View style={styles.header}>
      <Text style={styles.title}>通知</Text>
      <Bell color={colors.textMuted} size={22} />
    </View>
  );

  if (!hasSupabase) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        {header}
        <EmptyState title="通知是云端能力" subtitle="请配置 Supabase 后使用" />
      </SafeAreaView>
    );
  }

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        {header}
        <LoadingState />
      </SafeAreaView>
    );
  }

  if (isError) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        {header}
        <ErrorState onRetry={refetch} />
      </SafeAreaView>
    );
  }

  if (notifications.length === 0) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        {header}
        <EmptyState title="还没有通知" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {header}
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: contentBottomPad }]}>
        {notifications.map((item) => (
          <NotificationRow key={item.id} item={item} />
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
  },
  title: { ...typography.h1, color: colors.text },
  content: { paddingHorizontal: spacing.lg, gap: spacing.sm },
  row: {
    flexDirection: 'row', gap: spacing.md, alignItems: 'center',
    padding: spacing.md, backgroundColor: colors.surface, borderRadius: radius.md,
  },
  rowUnread: {
    backgroundColor: colors.surfaceHi,
  },
  iconBg: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surfaceHi,
    alignItems: 'center', justifyContent: 'center',
  },
  body: { ...typography.body, color: colors.text },
  who: { ...typography.bodyStrong, color: colors.text },
  what: { ...typography.body, color: colors.textSecondary },
  when: { ...typography.tiny, color: colors.textDim, marginTop: 2 },
});
