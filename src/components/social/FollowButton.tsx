import { Pressable, Text, StyleSheet } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { followUser, unfollowUser, isFollowing } from '@/api/supabase/followsRepo';
import { hasSupabase } from '@/api/client';
import { useAuth } from '@/store/auth';
import { colors, radius, spacing, typography } from '@/theme';

export function FollowButton({ targetUserId }: { targetUserId: string }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  // 自己不显示关注自己；未配 Supabase 不显示
  if (!hasSupabase || !user || user.id === targetUserId) return null;

  const { data: following = false } = useQuery({
    queryKey: ['isFollowing', targetUserId],
    queryFn: () => isFollowing(targetUserId),
  });

  const mut = useMutation({
    mutationFn: () => (following ? unfollowUser(targetUserId) : followUser(targetUserId)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['isFollowing', targetUserId] });
      qc.invalidateQueries({ queryKey: ['followCounts', targetUserId] });
    },
  });

  return (
    <Pressable
      style={[styles.btn, following && styles.btnFollowing]}
      onPress={() => mut.mutate()}
      disabled={mut.isPending}
    >
      <Text style={[styles.text, following && styles.textFollowing]}>
        {following ? '已关注' : '关注'}
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
