import { View, Text, StyleSheet, FlatList, Pressable, Share, Image, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useMemo, useEffect, useRef, useState } from 'react';
import { Settings, Share2, Lock } from 'lucide-react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { colors, radius, spacing, typography } from '@/theme';
import { useAuth } from '@/store/auth';
import { useLocalVideos } from '@/store/videos';
import { listMyVideos, listLikedVideos } from '@/api/videos';
import { hasSupabase } from '@/api/client';
import { resumePoll } from '@/api/supabase/generateClient';
import { useAiSettings } from '@/store/aiSettings';
import { getFollowCounts } from '@/api/supabase/followsRepo';
import { getProfile } from '@/api/supabase/profilesRepo';
import { useTabBarSpace } from '@/hooks/useTabBarSpace';
import { useVideoThumbnail } from '@/hooks/useVideoThumbnail';
import type { Video } from '@/api/types';
import { LoadingState, ErrorState, EmptyState } from '@/components/ui/ScreenState';
import { UserAvatar } from '@/components/ui/UserAvatar';

export default function ProfileScreen() {
  const router = useRouter();
  const { user, isAnonymous } = useAuth();
  const { contentBottomPad } = useTabBarSpace();
  const qc = useQueryClient();

  // ── Supabase 路径：react-query 从云端读本人所有视频（含草稿） ──────────────
  const { data: remoteVideos = [], isLoading: remoteLoading, isError: remoteError, refetch } = useQuery({
    queryKey: ['myVideos', user?.id],
    queryFn: () => listMyVideos(user?.id),
    enabled: hasSupabase && !!user && !isAnonymous,
  });

  // ── 本地保底路径 ────────────────────────────────────────────────────────────
  const allLocalVideos = useLocalVideos((s) => s.videos);
  const hydrate = useLocalVideos((s) => s.hydrate);
  useEffect(() => {
    if (!hasSupabase) hydrate();
  }, [hydrate]);

  const localVideos = useMemo(
    () => (user && !hasSupabase) ? allLocalVideos.filter((v) => v.author_id === user.id) : [],
    [allLocalVideos, user?.id],
  );

  // ── 统一出口 ────────────────────────────────────────────────────────────────
  const videos = hasSupabase ? remoteVideos : localVideos;
  const isLoading = hasSupabase ? remoteLoading : false;
  const isError = hasSupabase ? remoteError : false;

  // ── 进页面续轮询：对每个 generating 状态的视频恢复轮询，完成后刷新列表 ──────
  const pollingRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!hasSupabase || !user) return;
    for (const v of videos) {
      if (v.status === 'generating' && !pollingRef.current.has(v.id)) {
        pollingRef.current.add(v.id);
        // 续轮询也带上当前凭证（查询需 key）；现取 SecureStore，仅上送本次。
        (async () => {
          const s = useAiSettings.getState();
          const apiKey = (await s.getKey(s.provider)) ?? undefined;
          const model = s.modelByProvider[s.provider];
          return resumePoll(v.id, { apiKey, model });
        })()
          .catch(() => undefined)
          .finally(() => {
            pollingRef.current.delete(v.id);
            qc.invalidateQueries({ queryKey: ['myVideos', user.id] });
          });
      }
    }
  }, [videos, user, qc]);

  const { data: followCounts = { followers: 0, following: 0 } } = useQuery({
    queryKey: ['followCounts', user?.id],
    queryFn: () => getFollowCounts(user!.id),
    enabled: hasSupabase && !!user,
  });

  const { data: profile } = useQuery({
    queryKey: ['profile', user?.id],
    queryFn: () => getProfile(user!.id),
    enabled: hasSupabase && !!user,
  });

  // ── 作品/点赞 tab ──────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<'works' | 'liked'>('works');

  const { data: likedVideos = [] } = useQuery({
    queryKey: ['likedVideos', user?.id],
    queryFn: () => listLikedVideos(user!.id),
    enabled: hasSupabase && !!user && !isAnonymous && activeTab === 'liked',
  });

  const displayVideos = activeTab === 'works' ? videos : likedVideos;

  const totals = videos.reduce(
    (acc, v) => ({
      plays: acc.plays + (v.stats?.play_count ?? 0),
      likes: acc.likes + (v.stats?.like_count ?? 0),
      forks: acc.forks + (v.stats?.fork_count ?? 0),
    }),
    { plays: 0, likes: 0, forks: 0 },
  );

  if (isLoading) {
    return <LoadingState text="加载中…" />;
  }

  if (isError) {
    return <ErrorState onRetry={refetch} />;
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.topBar}>
        <Text style={styles.headerTitle}>个人主页</Text>
        <View style={styles.topRight}>
          <Pressable hitSlop={8} onPress={() => {
            const name = isAnonymous ? '我' : `@${user?.username}`;
            Share.share({ message: `来看看 ${name} 在 AI Shorts 的作品` }).catch(() => undefined);
          }}>
            <Share2 color={colors.text} size={20} />
          </Pressable>
          <Pressable hitSlop={8} onPress={() => router.push('/settings')}>
            <Settings color={colors.text} size={20} />
          </Pressable>
        </View>
      </View>

      <FlatList
        data={displayVideos}
        keyExtractor={(v) => v.id}
        numColumns={3}
        contentContainerStyle={[styles.grid, { paddingBottom: contentBottomPad }]}
        columnWrapperStyle={{ gap: 2 }}
        ListHeaderComponent={
          <View>
            <View style={styles.header}>
              <UserAvatar user={{ username: user?.username, avatar_url: profile?.avatar_url ?? null }} size={80} />
              <Text style={styles.name}>{isAnonymous ? '匿名访客' : `@${user?.username ?? 'me'}`}</Text>
              {profile?.bio ? (
                <Text style={styles.bio}>{profile.bio}</Text>
              ) : (
                <Text style={styles.bio}>{isAnonymous ? '登录后即可发布与收获' : '用 AI 讲你的故事'}</Text>
              )}

              <View style={styles.statsRow}>
                <View style={styles.statFlex}><Stat label="播放" value={totals.plays} /></View>
                <View style={styles.statFlex}>
                  <Pressable onPress={() => router.push('/list/forked' as any)}>
                    <Stat label="被续写" value={totals.forks} highlight />
                  </Pressable>
                </View>
                <View style={styles.statFlex}>
                  <Pressable onPress={() => router.push('/list/following' as any)}>
                    <Stat label="关注" value={followCounts.following} />
                  </Pressable>
                </View>
                <View style={styles.statFlex}>
                  <Pressable onPress={() => router.push('/list/followers' as any)}>
                    <Stat label="粉丝" value={followCounts.followers} />
                  </Pressable>
                </View>
              </View>

              {isAnonymous ? (
                <Pressable style={styles.loginBtn} onPress={() => router.push('/auth/login')}>
                  <Text style={styles.loginTxt}>登录 / 注册</Text>
                </Pressable>
              ) : null}
            </View>

            {/* 作品 / 点赞 tab bar */}
            <View style={styles.tabsRow}>
              <Pressable style={[styles.tabsItem, activeTab === 'works' && styles.tabsItemActive]} onPress={() => setActiveTab('works')}>
                <Text style={[styles.tabsText, activeTab === 'works' && styles.tabsTextActive]}>
                  作品 · {videos.length}
                  {activeTab === 'works' && videos.some((v) => v.visibility === 'private')
                    ? ` (${videos.filter((v) => v.visibility === 'private').length} 草稿)` : ''}
                </Text>
              </Pressable>
              <Pressable style={[styles.tabsItem, activeTab === 'liked' && styles.tabsItemActive]} onPress={() => setActiveTab('liked')}>
                <Text style={[styles.tabsText, activeTab === 'liked' && styles.tabsTextActive]}>点赞</Text>
              </Pressable>
            </View>
          </View>
        }
        renderItem={({ item }) => (
          item.status === 'generating'
            ? <GeneratingThumb video={item} />
            : <Thumb video={item} onPress={() => router.push(`/video/${item.id}` as any)} />
        )}
        ListEmptyComponent={
          activeTab === 'works' ? (
            <EmptyState
              title="还没有作品"
              subtitle="去 创作 页生成第一条 AI 短视频"
              cta={{ label: '开始创作', onPress: () => router.push('/(tabs)/create') }}
            />
          ) : (
            <EmptyState
              title="还没有点赞"
              subtitle="去 Feed 发现喜欢的视频，点赞收藏"
            />
          )
        }
      />
    </SafeAreaView>
  );
}

function Stat({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <View style={styles.statItem}>
      <Text style={[styles.statVal, highlight && styles.statValHi]}>{formatCount(value)}</Text>
      <Text style={styles.statLbl}>{label}</Text>
    </View>
  );
}

function GeneratingThumb({ video }: { video: Video }) {
  return (
    <View style={[styles.thumb, styles.generatingThumb]} pointerEvents="none">
      <ActivityIndicator size="small" color={colors.primary} />
      <Text style={styles.generatingText} numberOfLines={2}>
        {video.prompt ?? '生成中…'}
      </Text>
    </View>
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
      {video.visibility === 'private' && (
        <View style={styles.thumbDraftBadge}>
          <Lock size={10} color="#fff" />
          <Text style={styles.thumbDraftText}>草稿</Text>
        </View>
      )}
    </Pressable>
  );
}

function formatCount(n: number) {
  if (n < 1000) return String(n);
  if (n < 10_000) return (n / 1000).toFixed(1) + 'k';
  return (n / 10_000).toFixed(1) + '万';
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },

  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
  },
  headerTitle: { ...typography.h2, color: colors.text },
  topRight: { flexDirection: 'row', gap: spacing.lg, alignItems: 'center' },

  header: { alignItems: 'center', paddingTop: spacing.md, paddingBottom: spacing.lg, gap: spacing.xs },
  name: { ...typography.h2, color: colors.text },
  bio: { ...typography.caption, color: colors.textMuted },

  statsRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginTop: spacing.md, paddingHorizontal: spacing.sm, width: '100%',
  },
  statFlex: { flex: 1, alignItems: 'center' },
  statItem: { alignItems: 'center' },
  statVal: { ...typography.h2, color: colors.text },
  statValHi: { color: colors.primary },
  statLbl: { ...typography.tiny, color: colors.textMuted, marginTop: 2 },

  loginBtn: {
    marginTop: spacing.md, paddingHorizontal: spacing.xxl, paddingVertical: 10,
    backgroundColor: colors.primary, borderRadius: radius.pill,
  },
  loginTxt: { color: '#fff', fontWeight: '700', fontSize: 14 },

  tabsRow: {
    flexDirection: 'row', justifyContent: 'space-around',
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
  },
  tabsItem: { paddingVertical: spacing.md, flex: 1, alignItems: 'center' },
  tabsItemActive: { borderBottomWidth: 2, borderBottomColor: colors.text },
  tabsText: { ...typography.captionStrong, color: colors.textMuted },
  tabsTextActive: { ...typography.captionStrong, color: colors.text },
  sectionHeader: {
    paddingVertical: spacing.md, paddingHorizontal: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border,
  },
  sectionHeaderTxt: { ...typography.bodyStrong, color: colors.text },
  sectionHeaderSub: { ...typography.caption, color: colors.textMuted, fontWeight: '400' },

  grid: { paddingBottom: 0 },
  thumb: { flex: 1 / 3, aspectRatio: 9 / 16, marginBottom: 2 },
  thumbImg: { flex: 1 },
  generatingThumb: {
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    padding: spacing.xs,
  },
  generatingText: {
    ...typography.tiny,
    color: colors.textMuted,
    textAlign: 'center',
  },
  thumbDraftBadge: {
    position: 'absolute', top: 4, left: 4,
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 4, paddingVertical: 2,
    backgroundColor: 'rgba(0,0,0,0.7)', borderRadius: 4,
  },
  thumbDraftText: { color: '#fff', fontSize: 10, fontWeight: '700' },
});
