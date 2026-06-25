import { View, Text, Pressable, StyleSheet, ScrollView, Share, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, GitBranch, Scissors, Heart, MessageCircle, Share2, Home, Info, Globe, Lock, Trash2 } from 'lucide-react-native';
import { useState } from 'react';
import { getVideo, getVersionTree, toggleLike, type VersionNode } from '@/api/videos';
import { VideoPlayer } from '@/components/player/VideoPlayer';
import { CommentsSheet } from '@/components/comments/CommentsSheet';
import { useComments } from '@/store/comments';
import { useLocalVideos } from '@/store/videos';
import { showToast } from '@/components/toast/Toast';
import { showAuthRequired } from '@/components/dialog/ConfirmDialog';
import { colors, radius, spacing, typography } from '@/theme';
import { useAuth } from '@/store/auth';

export default function VideoDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const { user } = useAuth();
  const [commentsOpen, setCommentsOpen] = useState(false);
  const commentList = useComments((s) => s.byVideo[id ?? '']);
  const commentCount = commentList?.length ?? 0;

  // 直接订阅 zustand:发布/删除/点赞后立即反映,react-query 不知道本地变化
  const allVideos = useLocalVideos((s) => s.videos);
  const setVisibility = useLocalVideos((s) => s.setVisibility);
  const deleteVideo = useLocalVideos((s) => s.deleteVideo);
  const video = allVideos.find((v) => v.id === id);
  const isOwner = !!user && !!video && video.author_id === user.id;

  const { data: tree = [] } = useQuery({
    queryKey: ['tree', video?.root_id ?? id],
    queryFn: () => getVersionTree(video!.root_id ?? video!.id),
    enabled: !!video,
  });

  const likeMut = useMutation({
    mutationFn: () => toggleLike(id!, user?.id ?? null),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['video', id] }),
  });

  // 智能返回:如果有 navigation 栈就 back,否则回 Feed Tab。
  // 这避免了从 Create → push(video) 之后再 back 回不去的问题。
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
        <Text style={styles.placeholder}>加载中...</Text>
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
            editMetadata={video.edit_metadata}
            isActive
            looping
            showProgress={false}
          />
        </View>

        <View style={styles.meta}>
          {video.remix_kind && (
            <Pressable style={styles.kindBadge} hitSlop={6} onPress={() => Alert.alert(
              kindLabel(video.remix_kind!),
              video.remix_kind === 'continuation'
                ? '续写:以原视频最后一帧为起点,生成新一段画面,叙事接力。'
                : video.remix_kind === 'prompt_remix'
                ? 'Remix:基于原视频主题,用新的 prompt 重新生成,呈现不同风格。'
                : '剪辑:对原视频做非破坏性编辑(字幕/滤镜),无需重新生成。',
            )}>
              <GitBranch color={colors.accent} size={11} />
              <Text style={styles.kindText}>{kindLabel(video.remix_kind)}</Text>
              <Info color={colors.accent} size={11} />
            </Pressable>
          )}
          <Text style={styles.title} numberOfLines={4}>{video.title || video.prompt}</Text>
          <View style={styles.metaRow}>
            <Text style={styles.author}>@{video.author?.username ?? 'unknown'}</Text>
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

        {/* 作者本人操作:发布/取消发布、删除 */}
        {isOwner && (
          <View style={styles.ownerActions}>
            {video.visibility === 'public' ? (
              <Pressable
                style={styles.ownerBtn}
                onPress={() => {
                  setVisibility(video.id, 'private');
                  showToast({ message: '已设为草稿,从 Feed 隐藏' });
                }}
              >
                <Lock color={colors.text} size={16} />
                <Text style={styles.ownerBtnText}>设为草稿</Text>
              </Pressable>
            ) : (
              <Pressable
                style={[styles.ownerBtn, styles.ownerBtnPrimary]}
                onPress={() => {
                  setVisibility(video.id, 'public');
                  showToast({ message: '已发布,所有人都能看到', actionLabel: '去 Feed', onAction: () => router.replace('/(tabs)') });
                }}
              >
                <Globe color="#fff" size={16} />
                <Text style={[styles.ownerBtnText, { color: '#fff' }]}>发布到 Feed</Text>
              </Pressable>
            )}
            <Pressable
              style={[styles.ownerBtn, styles.ownerBtnDanger]}
              onPress={() => {
                Alert.alert('删除这条视频?', '此操作不可撤销', [
                  { text: '取消', style: 'cancel' },
                  {
                    text: '删除', style: 'destructive', onPress: () => {
                      deleteVideo(video.id);
                      showToast({ message: '视频已删除' });
                      if (router.canGoBack()) router.back();
                      else router.replace('/(tabs)');
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
            icon={<Scissors color={colors.text} size={22} strokeWidth={1.8} />}
            label="剪辑"
            onPress={() => {
              if (!user) {
                showAuthRequired('登录后即可剪辑发布 ✂️', () => router.push('/auth/login'));
                return;
              }
              router.push(`/editor/${video.id}`);
            }}
          />
          <ActionBtn
            icon={<Share2 color={colors.text} size={22} strokeWidth={1.8} />}
            label="分享"
            onPress={() => {
              Share.share({ message: `在 AI Shorts 看到一条不错的视频:${video.prompt}` }).catch(() => undefined);
            }}
          />
        </View>

        {tree.length > 1 && (
          <View style={styles.tree}>
            <View style={styles.treeHeader}>
              <GitBranch color={colors.accent} size={14} />
              <Text style={styles.treeTitle}>版本树 · {tree.length} 个版本</Text>
            </View>
            {tree.slice(0, 8).map((node) => (
              <Pressable
                key={node.id}
                style={[styles.treeRow, node.id === id && styles.treeRowActive]}
                onPress={() => router.replace(`/video/${node.id}`)}
              >
                <Text style={styles.treeBullet}>
                  {'  '.repeat(node.depth)}└ {kindLabelShort(node.remix_kind)}
                </Text>
                <Text style={styles.treeText} numberOfLines={1}>
                  @{node.author_username ?? '?'} · {node.prompt?.slice(0, 26) ?? '(剪辑)'}
                </Text>
              </Pressable>
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
    case 'edit': return '剪辑自他人';
    default: return '原视频';
  }
}

function kindLabelShort(k: VersionNode['remix_kind']) {
  switch (k) {
    case 'continuation': return '续写';
    case 'prompt_remix': return 'Remix';
    case 'edit': return '剪辑';
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
  treeRow: {
    flexDirection: 'row', gap: spacing.sm, alignItems: 'center',
    padding: spacing.sm, borderRadius: radius.sm,
  },
  treeRowActive: { backgroundColor: colors.surface },
  treeBullet: { color: colors.textMuted, fontFamily: 'Courier', fontSize: 12 },
  treeText: { color: colors.textSecondary, ...typography.caption, flex: 1 },
});
