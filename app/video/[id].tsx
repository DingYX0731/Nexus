import { View, Text, Pressable, StyleSheet, ScrollView, Share, Alert } from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, GitBranch, Heart, MessageCircle, Share2, Home, Info, Globe, Lock, Trash2 } from 'lucide-react-native';
import { useState } from 'react';
import { getVideo, getVersionTree, getContinuationChain, toggleLike, setVisibility as daoSetVisibility, deleteVideo as daoDeleteVideo, type VersionNode } from '@/api/videos';
import { VideoPlayer } from '@/components/player/VideoPlayer';
import { CommentsSheet } from '@/components/comments/CommentsSheet';
import { useComments } from '@/store/comments';
import { useLocalVideos } from '@/store/videos';
import { showToast } from '@/components/toast/Toast';
import { showAuthRequired } from '@/components/dialog/ConfirmDialog';
import { colors, radius, spacing, typography } from '@/theme';
import { useAuth } from '@/store/auth';
import { hasSupabase } from '@/api/client';
import { LoadingState, ErrorState, EmptyState } from '@/components/ui/ScreenState';
import { FollowButton } from '@/components/social/FollowButton';
import { UserAvatar } from '@/components/ui/UserAvatar';

export default function VideoDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const { user } = useAuth();
  const [commentsOpen, setCommentsOpen] = useState(false);
  const commentList = useComments((s) => s.byVideo[id ?? '']);
  const commentCount = commentList?.length ?? 0;

  // ── Supabase 路径：useQuery 从云端读单视频 ──────────────────────────────────
  const { data: remoteVideo, isLoading: videoLoading, isError: videoError, refetch: videoRefetch } = useQuery({
    queryKey: ['video', id],
    queryFn: () => getVideo(id!),
    enabled: hasSupabase && !!id,
  });

  // ── 本地保底路径：订阅 Zustand（乐观更新来源） ──────────────────────────────
  const allLocalVideos = useLocalVideos((s) => s.videos);
  const localVideo = allLocalVideos.find((v) => v.id === id);

  // 优先云端数据；本地 Zustand 用作乐观 fallback（hasSupabase=false 时的唯一来源）
  const video = hasSupabase ? (remoteVideo ?? localVideo) : localVideo;
  const isOwner = !!user && !!video && video.author_id === user.id;

  const isLoading = hasSupabase ? videoLoading : false;
  const isError = hasSupabase ? videoError : false;

  const { data: tree = [] } = useQuery({
    queryKey: ['tree', video?.root_id ?? id],
    queryFn: () => getVersionTree(video!.root_id ?? video!.id),
    enabled: !!video,
  });

  // 续写连贯播放：从根到当前视频的所有片段，依次连播
  const { data: chain = [] } = useQuery({
    queryKey: ['chain', video?.id],
    queryFn: () => getContinuationChain(video!.id),
    enabled: !!video && video.status === 'ready',
  });
  const isChain = chain.length > 1;

  const likeMut = useMutation({
    mutationFn: () => toggleLike(id!, user?.id ?? null),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['video', id] });
      qc.invalidateQueries({ queryKey: ['feed'] });
    },
  });

  const visibilityMut = useMutation({
    mutationFn: (vis: 'public' | 'private') => daoSetVisibility(id!, vis),
    onSuccess: (_data, vis) => {
      // 乐观更新本地 store（非 Supabase 模式或 Supabase 模式下的即时 UI 响应）
      useLocalVideos.getState().setVisibility(id!, vis);
      qc.invalidateQueries({ queryKey: ['video', id] });
      qc.invalidateQueries({ queryKey: ['feed'] });
      qc.invalidateQueries({ queryKey: ['myVideos', user?.id] });
    },
  });

  const deleteMut = useMutation({
    mutationFn: () => daoDeleteVideo(id!),
    onSuccess: () => {
      useLocalVideos.getState().deleteVideo(id!);
      qc.invalidateQueries({ queryKey: ['feed'] });
      qc.invalidateQueries({ queryKey: ['myVideos', user?.id] });
      showToast({ message: '视频已删除' });
      if (router.canGoBack()) router.back();
      else router.replace('/(tabs)');
    },
  });

  // 智能返回：如果有 navigation 栈就 back，否则回 Feed Tab。
  const onBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  };

  if (!video) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.topBar}>
          <Pressable hitSlop={12} style={styles.iconBtn} onPress={onBack}>
            <ArrowLeft color="#fff" size={22} />
          </Pressable>
        </View>
        {isLoading ? (
          <LoadingState text="加载中…" />
        ) : isError ? (
          <ErrorState onRetry={videoRefetch} />
        ) : (
          <EmptyState title="视频不存在" />
        )}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.topBar}>
        <Pressable hitSlop={12} style={styles.iconBtn} onPress={onBack}>
          <ArrowLeft color="#fff" size={22} />
        </Pressable>
        <Text style={styles.topTitle} numberOfLines={1}>@{video.author?.username ?? 'unknown'}</Text>
        <Pressable hitSlop={12} style={styles.iconBtn} onPress={() => router.replace('/(tabs)')}>
          <Home color="#fff" size={20} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 32 }} showsVerticalScrollIndicator={false}>
        <View style={styles.player}>
          <VideoPlayer
            videoUrl={video.video_url}
            clips={isChain ? chain.map((c) => ({ videoUrl: c.videoUrl, durationMs: c.durationMs })) : undefined}
            isActive
            looping
            showProgress={isChain}
            progressBottomOffset={8}
          />
          {isChain && (
            <View style={styles.chainBadge} pointerEvents="none">
              <GitBranch color="#fff" size={11} />
              <Text style={styles.chainBadgeText}>{chain.length} 段连贯播放</Text>
            </View>
          )}
        </View>

        <View style={styles.meta}>
          {video.remix_kind && (
            <Pressable style={styles.kindBadge} hitSlop={6} onPress={() => Alert.alert(
              kindLabel(video.remix_kind!),
              video.remix_kind === 'continuation'
                ? '续写：以原视频最后一帧为起点，生成新一段画面，叙事接力。'
                : 'Remix：基于原视频主题，用新的 prompt 重新生成，呈现不同风格。',
            )}>
              <GitBranch color={colors.accent} size={11} />
              <Text style={styles.kindText}>{kindLabel(video.remix_kind)}</Text>
              <Info color={colors.accent} size={11} />
            </Pressable>
          )}
          <Text style={styles.title} numberOfLines={4}>{video.title || video.prompt}</Text>
          <View style={styles.metaRow}>
            <Text style={styles.author}>@{video.author?.username ?? 'unknown'}</Text>
            {!!video.author_id && <FollowButton targetUserId={video.author_id} />}
            <Text style={styles.dot}>·</Text>
            <Text style={styles.statText}>{video.stats?.play_count ?? 0} 次播放</Text>
            {isOwner && (
              <>
                <Text style={styles.dot}>·</Text>
                <View style={[styles.visBadge, video.visibility === 'public' ? styles.visPublic : styles.visPrivate]}>
                  {video.visibility === 'public'
                    ? <Globe size={10} color={colors.success} />
                    : <Lock size={10} color={colors.warning} />}
                  <Text style={[styles.visText, { color: video.visibility === 'public' ? colors.success : colors.warning }]}>
                    {video.visibility === 'public' ? '已发布' : '草稿'}
                  </Text>
                </View>
              </>
            )}
          </View>
        </View>

        {/* 作者本人操作：发布/取消发布、删除 */}
        {isOwner && (
          <View style={styles.ownerActions}>
            {video.visibility === 'public' ? (
              <Pressable
                style={styles.ownerBtn}
                onPress={() => {
                  visibilityMut.mutate('private');
                  showToast({ message: '已设为草稿，从 Feed 隐藏' });
                }}
              >
                <Lock color={colors.text} size={16} />
                <Text style={styles.ownerBtnText}>设为草稿</Text>
              </Pressable>
            ) : (
              <Pressable
                style={[styles.ownerBtn, styles.ownerBtnPrimary]}
                onPress={() => {
                  visibilityMut.mutate('public');
                  showToast({ message: '已发布，所有人都能看到', actionLabel: '去 Feed', onAction: () => router.replace('/(tabs)') });
                }}
              >
                <Globe color="#fff" size={16} />
                <Text style={[styles.ownerBtnText, { color: '#fff' }]}>发布到 Feed</Text>
              </Pressable>
            )}
            <Pressable
              style={[styles.ownerBtn, styles.ownerBtnDanger]}
              onPress={() => {
                Alert.alert('删除这条视频？', '此操作不可撤销', [
                  { text: '取消', style: 'cancel' },
                  {
                    text: '删除', style: 'destructive', onPress: () => {
                      deleteMut.mutate();
                    },
                  },
                ]);
              }}
            >
              <Trash2 color={colors.danger} size={16} />
            </Pressable>
          </View>
        )}

        <View style={styles.actions}>
          <ActionBtn
            icon={<Heart color={video.is_liked ? colors.primary : colors.text} size={22} fill={video.is_liked ? colors.primary : 'transparent'} strokeWidth={1.8} />}
            label={String(video.stats?.like_count ?? 0)}
            onPress={() => {
              if (!user) {
                showAuthRequired('登录后即可点赞 ❤️', () => router.push('/auth/login'));
                return;
              }
              likeMut.mutate();
            }}
          />
          <ActionBtn
            icon={<MessageCircle color={colors.text} size={22} strokeWidth={1.8} />}
            label={String(commentCount || (video.stats?.comment_count ?? 0))}
            onPress={() => setCommentsOpen(true)}
          />
          <ActionBtn
            icon={<GitBranch color={colors.text} size={22} strokeWidth={1.8} />}
            label={`续写 ${video.stats?.fork_count ?? 0}`}
            onPress={() => {
              if (!user) {
                showAuthRequired('登录后即可续写、Remix ✨', () => router.push('/auth/login'));
                return;
              }
              router.push(`/remix/${video.id}`);
            }}
          />
          <ActionBtn
            icon={<Share2 color={colors.text} size={22} strokeWidth={1.8} />}
            label="分享"
            onPress={() => {
              Share.share({ message: `在 AI Shorts 看到一条不错的视频：${video.prompt}` }).catch(() => undefined);
            }}
          />
        </View>

        {tree.length > 1 && (
          <View style={styles.tree}>
            <View style={styles.treeHeader}>
              <GitBranch color={colors.accent} size={14} />
              <Text style={styles.treeTitle}>版本树 · {tree.length} 个版本</Text>
            </View>
            {tree.slice(0, 20).map((node) => (
              <View key={node.id} style={[styles.treeCard, node.id === id && styles.treeCardActive, { marginLeft: node.depth * 16 }]}>
                <Pressable
                  style={styles.treeCardMain}
                  onPress={() => router.replace(`/video/${node.id}` as any)}
                >
                  {/* 缩略图 */}
                  {node.thumbnail_url ? (
                    <Image source={{ uri: node.thumbnail_url }} style={styles.treeThumb} contentFit="cover" />
                  ) : (
                    <View style={[styles.treeThumb, styles.treeThumbPlaceholder]} />
                  )}
                  {/* 文字区 */}
                  <View style={styles.treeCardContent}>
                    <View style={styles.treeCardRow}>
                      <UserAvatar user={{ username: node.author_username, avatar_url: node.author_avatar_url }} size={20} />
                      <Text style={styles.treeCardAuthor} numberOfLines={1}>@{node.author_username ?? '?'}</Text>
                      <View style={styles.treeKindBadge}>
                        <Text style={styles.treeKindText}>{kindLabelShort(node.remix_kind)}</Text>
                      </View>
                    </View>
                    <Text style={styles.treeCardPrompt} numberOfLines={1}>
                      {node.prompt?.slice(0, 40) ?? '(无描述)'}
                    </Text>
                  </View>
                </Pressable>
                {/* 从此续写按钮 */}
                <Pressable
                  style={styles.treeRemixBtn}
                  hitSlop={6}
                  onPress={() => router.push(`/remix/${node.id}` as any)}
                >
                  <GitBranch color={colors.accent} size={14} />
                  <Text style={styles.treeRemixText}>续写</Text>
                </Pressable>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      <CommentsSheet
        videoId={video.id}
        visible={commentsOpen}
        onClose={() => setCommentsOpen(false)}
      />
    </SafeAreaView>
  );
}

function ActionBtn({ icon, label, onPress }: { icon: React.ReactNode; label: string; onPress: () => void }) {
  return (
    <Pressable style={styles.actionBtn} onPress={onPress} hitSlop={6}>
      {icon}
      <Text style={styles.actionLbl}>{label}</Text>
    </Pressable>
  );
}

function kindLabel(k: VersionNode['remix_kind']) {
  switch (k) {
    case 'continuation': return '续写自他人';
    case 'prompt_remix': return 'Remix 自他人';
    default: return '原视频';
  }
}

function kindLabelShort(k: VersionNode['remix_kind']) {
  switch (k) {
    case 'continuation': return '续写';
    case 'prompt_remix': return 'Remix';
    default: return '原视频';
  }
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },

  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
  },
  iconBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: colors.surface,
    alignItems: 'center', justifyContent: 'center',
  },
  topTitle: { ...typography.h3, color: colors.text, flex: 1, marginHorizontal: spacing.md, textAlign: 'center' },

  placeholder: { color: colors.text, padding: spacing.lg },
  player: { aspectRatio: 9 / 16, backgroundColor: '#000' },
  chainBadge: {
    position: 'absolute', top: 12, left: 12,
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 4,
    backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 6,
  },
  chainBadgeText: { color: '#fff', ...typography.tiny, fontWeight: '600' },

  meta: { padding: spacing.lg, gap: spacing.sm },
  kindBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    alignSelf: 'flex-start',
    backgroundColor: colors.accentSoft,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4,
  },
  kindText: { ...typography.tiny, color: colors.accent, fontWeight: '600' },
  title: { ...typography.h3, color: colors.text, lineHeight: 24 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  author: { ...typography.captionStrong, color: colors.textSecondary },
  dot: { color: colors.textDim },
  statText: { ...typography.caption, color: colors.textMuted },

  visBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  visPublic: { backgroundColor: 'rgba(34,197,94,0.14)' },
  visPrivate: { backgroundColor: 'rgba(245,158,11,0.14)' },
  visText: { ...typography.tiny, fontWeight: '700' },

  ownerActions: {
    flexDirection: 'row', gap: spacing.sm,
    paddingHorizontal: spacing.lg, paddingBottom: spacing.md,
  },
  ownerBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    backgroundColor: colors.surface, borderRadius: radius.pill,
    borderWidth: 1, borderColor: colors.border,
    flex: 1, justifyContent: 'center',
  },
  ownerBtnPrimary: { backgroundColor: colors.primary, borderColor: colors.primary },
  ownerBtnDanger: { flex: 0, paddingHorizontal: spacing.md, borderColor: colors.border },
  ownerBtnText: { ...typography.captionStrong, color: colors.text },

  actions: {
    flexDirection: 'row', justifyContent: 'space-around',
    paddingVertical: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
  },
  actionBtn: { alignItems: 'center', gap: 6, minWidth: 56 },
  actionLbl: { ...typography.tiny, color: colors.text },

  tree: { padding: spacing.lg, gap: spacing.sm },
  treeHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.xs },
  treeTitle: { ...typography.captionStrong, color: colors.text },
  // legacy simple row (unused after upgrade, kept for type safety)
  treeRow: {
    flexDirection: 'row', gap: spacing.sm, alignItems: 'center',
    padding: spacing.sm, borderRadius: radius.sm,
  },
  treeRowActive: { backgroundColor: colors.surface },
  treeBullet: { color: colors.textMuted, fontFamily: 'Courier', fontSize: 12 },
  treeText: { color: colors.textSecondary, ...typography.caption, flex: 1 },
  // card styles
  treeCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.surface, borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border,
    overflow: 'hidden',
  },
  treeCardActive: { borderColor: colors.primary, borderWidth: 1.5 },
  treeCardMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.sm },
  treeThumb: { width: 40, height: 56, borderRadius: 4 },
  treeThumbPlaceholder: { backgroundColor: colors.surfaceAlt },
  treeCardContent: { flex: 1, gap: 4 },
  treeCardRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  treeCardAuthor: { ...typography.tiny, color: colors.textSecondary, flex: 1 },
  treeKindBadge: {
    backgroundColor: colors.accentSoft, paddingHorizontal: 5, paddingVertical: 2, borderRadius: 3,
  },
  treeKindText: { ...typography.tiny, color: colors.accent, fontWeight: '600' },
  treeCardPrompt: { ...typography.tiny, color: colors.textMuted },
  treeRemixBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: spacing.sm, paddingVertical: spacing.sm,
    borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: colors.border,
  },
  treeRemixText: { ...typography.tiny, color: colors.accent, fontWeight: '600' },
});
