import { useEffect, useMemo } from 'react';
import { View, Text, ActivityIndicator, StyleSheet, Pressable } from 'react-native';
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
import { colors, radius, spacing, typography } from '@/theme';

export default function FeedScreen() {
  const router = useRouter();
  const qc = useQueryClient();

  // ── Supabase 路径：react-query 从云端读已发布视频 ──────────────────────────
  const { data: remoteVideos = [], isLoading: remoteLoading } = useQuery({
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

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (videos.length === 0) {
    return (
      <View style={styles.center}>
        <View style={styles.emptyIcon}>
          <Sparkles color={colors.primary} size={32} />
        </View>
        <Text style={styles.emptyTitle}>还没有视频</Text>
        <Text style={styles.emptyText}>成为第一个创作者,用 AI 生成你的短视频</Text>
        <Pressable style={styles.cta} onPress={() => router.push('/(tabs)/create')}>
          <Text style={styles.ctaText}>开始创作</Text>
        </Pressable>
      </View>
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
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#000', padding: 24, gap: spacing.md },
  emptyIcon: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: colors.primarySoft,
    alignItems: 'center', justifyContent: 'center',
  },
  emptyTitle: { ...typography.h1, color: colors.text },
  emptyText: { ...typography.body, color: colors.textMuted, textAlign: 'center' },
  cta: {
    marginTop: spacing.md,
    paddingHorizontal: spacing.xxl, paddingVertical: spacing.md,
    backgroundColor: colors.primary, borderRadius: radius.pill,
  },
  ctaText: { ...typography.button, color: '#fff' },
});
