import { View, Text, StyleSheet, FlatList, Pressable, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ChevronLeft, Lock } from 'lucide-react-native';
import { useQuery } from '@tanstack/react-query';
import { colors, radius, spacing, typography } from '@/theme';
import { getProfile } from '@/api/supabase/profilesRepo';
import { getFollowCounts } from '@/api/supabase/followsRepo';
import { listUserVideos } from '@/api/videos';
import { useVideoThumbnail } from '@/hooks/useVideoThumbnail';
import type { Video } from '@/api/types';
import { LoadingState, ErrorState, EmptyState } from '@/components/ui/ScreenState';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { FollowButton } from '@/components/social/FollowButton';
import { useT } from '@/i18n';

export default function UserProfileScreen() {
  const t = useT();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const {
    data: profile,
    isLoading: profileLoading,
    isError: profileError,
  } = useQuery({
    queryKey: ['profile', id],
    queryFn: () => getProfile(id),
    enabled: !!id,
  });

  const { data: followCounts = { followers: 0, following: 0 } } = useQuery({
    queryKey: ['followCounts', id],
    queryFn: () => getFollowCounts(id),
    enabled: !!id,
  });

  const {
    data: videos = [],
    isLoading: videosLoading,
    isError: videosError,
    refetch,
  } = useQuery({
    queryKey: ['userVideos', id],
    queryFn: () => listUserVideos(id),
    enabled: !!id,
  });

  const isLoading = profileLoading || videosLoading;
  const isError = profileError || videosError;

  if (isLoading) {
    return <LoadingState text={t('common.loading')} />;
  }

  if (isError) {
    return <ErrorState onRetry={refetch} />;
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.topBar}>
        <Pressable hitSlop={12} onPress={() => router.back()}>
          <ChevronLeft color={colors.text} size={24} />
        </Pressable>
        <Text style={styles.headerTitle}>{profile?.username ? `@${profile.username}` : t('userProfile.title')}</Text>
        <View style={{ width: 24 }} />
      </View>

      <FlatList
        data={videos}
        keyExtractor={(v) => v.id}
        numColumns={3}
        columnWrapperStyle={{ gap: 2 }}
        contentContainerStyle={styles.grid}
        ListHeaderComponent={
          <View style={styles.header}>
            <UserAvatar
              user={{ username: profile?.username, avatar_url: profile?.avatar_url ?? null }}
              size={80}
            />
            <Text style={styles.name}>{profile?.username ? `@${profile.username}` : '…'}</Text>
            {profile?.bio ? (
              <Text style={styles.bio}>{profile.bio}</Text>
            ) : null}

            <View style={styles.statsRow}>
              <View style={styles.statFlex}>
                <Text style={styles.statVal}>{followCounts.following}</Text>
                <Text style={styles.statLbl}>{t('stat.following')}</Text>
              </View>
              <View style={styles.statFlex}>
                <Text style={styles.statVal}>{followCounts.followers}</Text>
                <Text style={styles.statLbl}>{t('stat.followers')}</Text>
              </View>
              <View style={styles.statFlex}>
                <Text style={styles.statVal}>{videos.length}</Text>
                <Text style={styles.statLbl}>{t('stat.works')}</Text>
              </View>
            </View>

            {id ? <FollowButton targetUserId={id} /> : null}
          </View>
        }
        renderItem={({ item }) => (
          <Thumb video={item} onPress={() => router.push(`/video/${item.id}` as any)} />
        )}
        ListEmptyComponent={
          <EmptyState
            title={t('userProfile.emptyTitle')}
            subtitle={t('userProfile.emptySub')}
          />
        }
      />
    </SafeAreaView>
  );
}

function Thumb({ video, onPress }: { video: Video; onPress: () => void }) {
  const t = useT();
  const thumb = useVideoThumbnail(
    !video.thumbnail_url ? video.video_url : undefined,
    video.thumbnail_url ?? null,
  );
  return (
    <Pressable style={styles.thumb} onPress={onPress}>
      {thumb ? (
        <Image source={{ uri: thumb }} style={styles.thumbImg} />
      ) : (
        <View style={[styles.thumbImg, { backgroundColor: colors.surfaceAlt }]} />
      )}
      {video.visibility === 'private' && (
        <View style={styles.thumbDraftBadge}>
          <Lock size={10} color="#fff" />
          <Text style={styles.thumbDraftText}>{t('state.draft')}</Text>
        </View>
      )}
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

  header: {
    alignItems: 'center', paddingTop: spacing.md, paddingBottom: spacing.lg,
    gap: spacing.sm,
  },
  name: { ...typography.h2, color: colors.text },
  bio: { ...typography.caption, color: colors.textMuted, textAlign: 'center', paddingHorizontal: spacing.xl },

  statsRow: {
    flexDirection: 'row', alignItems: 'center',
    marginTop: spacing.sm, width: '80%',
  },
  statFlex: { flex: 1, alignItems: 'center' },
  statVal: { ...typography.h2, color: colors.text },
  statLbl: { ...typography.tiny, color: colors.textMuted, marginTop: 2 },

  grid: { paddingBottom: spacing.xl },
  thumb: { flex: 1 / 3, aspectRatio: 9 / 16, marginBottom: 2 },
  thumbImg: { flex: 1 },
  thumbDraftBadge: {
    position: 'absolute', top: 4, left: 4,
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 4, paddingVertical: 2,
    backgroundColor: 'rgba(0,0,0,0.7)', borderRadius: radius.sm,
  },
  thumbDraftText: { color: '#fff', fontSize: 10, fontWeight: '700' },
});
