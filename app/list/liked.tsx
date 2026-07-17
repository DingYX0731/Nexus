import { View, Text, StyleSheet, FlatList, Pressable, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { useQuery } from '@tanstack/react-query';
import { colors, spacing, typography } from '@/theme';
import { useAuth } from '@/store/auth';
import { listLikedVideos } from '@/api/videos';
import { useVideoThumbnail } from '@/hooks/useVideoThumbnail';
import type { Video } from '@/api/types';
import { LoadingState, ErrorState, EmptyState } from '@/components/ui/ScreenState';

export default function LikedScreen() {
  const router = useRouter();
  const { user } = useAuth();

  const { data: videos = [], isLoading, isError, refetch } = useQuery({
    queryKey: ['likedVideos', user?.id],
    queryFn: () => listLikedVideos(user!.id),
    enabled: !!user,
  });

  if (isLoading) return <LoadingState text="加载中…" />;
  if (isError) return <ErrorState onRetry={refetch} />;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.topBar}>
        <Pressable hitSlop={12} onPress={() => router.back()}>
          <ChevronLeft color={colors.text} size={24} />
        </Pressable>
        <Text style={styles.headerTitle}>我点赞的</Text>
        <View style={{ width: 24 }} />
      </View>

      <FlatList
        data={videos}
        keyExtractor={(v) => v.id}
        numColumns={3}
        columnWrapperStyle={{ gap: 2 }}
        contentContainerStyle={styles.grid}
        renderItem={({ item }) => (
          <Thumb video={item} onPress={() => router.push(`/video/${item.id}` as any)} />
        )}
        ListEmptyComponent={
          <EmptyState title="还没有点赞的视频" subtitle="去浏览 Feed 发现好视频" />
        }
      />
    </SafeAreaView>
  );
}

function Thumb({ video, onPress }: { video: Video; onPress: () => void }) {
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
  grid: { paddingBottom: spacing.xl },
  thumb: { flex: 1 / 3, aspectRatio: 9 / 16, marginBottom: 2 },
  thumbImg: { flex: 1 },
});
