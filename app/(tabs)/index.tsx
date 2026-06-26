import { useEffect, useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Sparkles } from 'lucide-react-native';
import { FeedPager } from '@/components/feed/FeedPager';
import { useLocalVideos } from '@/store/videos';
import { listFeed } from '@/api/videos';
import { hasSupabase } from '@/api/client';
import { colors } from '@/theme';
import { LoadingState, ErrorState, EmptyState } from '@/components/ui/ScreenState';

export default function FeedScreen() {
  const router = useRouter();
  const qc = useQueryClient();

  // ── Supabase 路径：react-query 从云端读已发布视频 ──────────────────────────
  const { data: remoteVideos = [], isLoading: remoteLoading, isError: remoteError, refetch } = useQuery({
    queryKey: ['feed'],
    queryFn: listFeed,
    enabled: hasSupabase,
  });

  // 每次 tab 聚焦时重新拉取（捕捉他人发布的新视频）
  useFocusEffect(
    useCallback(() => {
      if (hasSupabase) {
        qc.invalidateQueries({ queryKey: ['feed'] });
      }
    }, [qc]),
  );

  // ── 本地保底路径 ────────────────────────────────────────────────────────────
  const hydrate = useLocalVideos((s) => s.hydrate);
  const allLocalVideos = useLocalVideos((s) => s.videos);
  useEffect(() => {
    if (!hasSupabase) hydrate();
  }, [hydrate]);

  const localVideos = useMemo(
    () => allLocalVideos
      .filter((v) => (v.visibility ?? 'public') === 'public' && v.status === 'ready')
      .sort((a, b) => b.created_at.localeCompare(a.created_at)),
    [allLocalVideos],
  );

  // ── 统一出口 ────────────────────────────────────────────────────────────────
  const videos = hasSupabase ? remoteVideos : localVideos;
  const isLoading = hasSupabase ? remoteLoading : false;
  const isError = hasSupabase ? remoteError : false;

  if (isLoading) {
    return <LoadingState text="加载中…" />;
  }

  if (isError) {
    return <ErrorState onRetry={refetch} />;
  }

  if (videos.length === 0) {
    return (
      <EmptyState
        title="还没有视频"
        subtitle="成为第一个创作者,用 AI 生成你的短视频"
        icon={<Sparkles color={colors.primary} size={32} />}
        cta={{ label: '开始创作', onPress: () => router.push('/(tabs)/create') }}
      />
    );
  }
  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <FeedPager videos={videos} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
});
