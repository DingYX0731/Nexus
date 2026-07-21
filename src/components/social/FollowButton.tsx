import { Pressable, Text, StyleSheet } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { followUser, unfollowUser, isFollowing } from '@/api/supabase/followsRepo';
import { hasSupabase } from '@/api/client';
import { useAuth } from '@/store/auth';
import { colors, radius, spacing, typography } from '@/theme';
import { useT } from '@/i18n';

export function FollowButton({ targetUserId }: { targetUserId: string }) {
  const t = useT();
  const qc = useQueryClient();
  const { user } = useAuth();
  // 自己不显示关注自己；未配 Supabase 不显示
  const shouldShow = hasSupabase && !!user && user.id !== targetUserId;

  const { data: following = false } = useQuery({
    queryKey: ['isFollowing', targetUserId],
    queryFn: () => isFollowing(targetUserId),
    enabled: shouldShow,
  });

  const mut = useMutation({
    mutationFn: () => (following ? unfollowUser(targetUserId) : followUser(targetUserId)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['isFollowing', targetUserId] });
      qc.invalidateQueries({ queryKey: ['followCounts', targetUserId] });
      // 当前用户的"关注数"也变了，刷新自己个人页的 followCounts
      qc.invalidateQueries({ queryKey: ['followCounts', user?.id] });
    },
  });

  if (!shouldShow) return null;

  return (
    <Pressable
      style={[styles.btn, following && styles.btnFollowing]}
      onPress={() => mut.mutate()}
      disabled={mut.isPending}
    >
      <Text style={[styles.text, following && styles.textFollowing]}>
        {following ? t('follow.following') : t('follow.follow')}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: { paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: radius.pill, backgroundColor: colors.primary },
  btnFollowing: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.border },
  text: { ...typography.captionStrong, color: '#fff' },
  textFollowing: { color: colors.textMuted },
});
