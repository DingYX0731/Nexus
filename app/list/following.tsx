import { View, Text, StyleSheet, FlatList, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { useQuery } from '@tanstack/react-query';
import { colors, spacing, typography } from '@/theme';
import { useAuth } from '@/store/auth';
import { hasSupabase } from '@/api/client';
import { listFollowing, type UserSummary } from '@/api/supabase/followsRepo';
import { LoadingState, ErrorState, EmptyState } from '@/components/ui/ScreenState';
import { UserAvatar } from '@/components/ui/UserAvatar';

export default function FollowingScreen() {
  const router = useRouter();
  const { user, isAnonymous } = useAuth();

  const { data: users = [], isLoading, isError, refetch } = useQuery({
    queryKey: ['following', user?.id],
    queryFn: () => listFollowing(user!.id),
    enabled: hasSupabase && !!user && !isAnonymous,
  });

  if (isLoading) return <LoadingState text="加载中…" />;
  if (isError) return <ErrorState onRetry={refetch} />;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.topBar}>
        <Pressable hitSlop={12} onPress={() => router.back()}>
          <ChevronLeft color={colors.text} size={24} />
        </Pressable>
        <Text style={styles.headerTitle}>我关注的</Text>
        <View style={{ width: 24 }} />
      </View>

      <FlatList
        data={users}
        keyExtractor={(u) => u.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => <UserRow user={item} onPress={() => router.push(`/user/${item.id}` as any)} />}
        ListEmptyComponent={
          <EmptyState title="还没有关注任何人" subtitle="去探索 Feed 发现有趣的创作者" />
        }
      />
    </SafeAreaView>
  );
}

function UserRow({ user, onPress }: { user: UserSummary; onPress: () => void }) {
  return (
    <Pressable style={styles.row} onPress={onPress}>
      <UserAvatar user={{ username: user.username, avatar_url: user.avatar_url }} size={44} />
      <Text style={styles.username}>@{user.username}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
  },
  headerTitle: { ...typography.h3, color: colors.text },
  list: { paddingBottom: spacing.xl },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
  },
  username: { ...typography.body, color: colors.text },
});
