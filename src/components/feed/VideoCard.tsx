import { useState, useEffect } from 'react';
import { View, Text, Pressable, StyleSheet, Image, Share } from 'react-native';
import { useRouter } from 'expo-router';
import { Heart, GitBranch, Scissors, MessageCircle, Share2 } from 'lucide-react-native';
import Animated, {
  useSharedValue, useAnimatedStyle, withSpring, withSequence,
} from 'react-native-reanimated';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Video } from '@/api/types';
import { toggleLike as daoToggleLike } from '@/api/videos';
import { VideoPlayer } from '@/components/player/VideoPlayer';
import { CommentsSheet } from '@/components/comments/CommentsSheet';
import { showAuthRequired } from '@/components/dialog/ConfirmDialog';
import { useAuth } from '@/store/auth';
import { useComments } from '@/store/comments';
import { useTabBarSpace } from '@/hooks/useTabBarSpace';
import { colors, spacing, typography } from '@/theme';

export function VideoCard({ video, isActive }: { video: Video; isActive: boolean }) {
  const router = useRouter();
  const { tabBarHeight } = useTabBarSpace();
  const { user } = useAuth();
  const ensureSeeded = useComments((s) => s.ensureSeeded);
  const commentList = useComments((s) => s.byVideo[video.id]);
  const commentCount = commentList?.length ?? 0;

  const [commentsOpen, setCommentsOpen] = useState(false);

  // Seed comments on mount so the count is non-zero in the feed
  useEffect(() => { ensureSeeded(video.id); }, [video.id, ensureSeeded]);

  const heartScale = useSharedValue(1);
  const heartStyle = useAnimatedStyle(() => ({ transform: [{ scale: heartScale.value }] }));

  const qc = useQueryClient();
  const likeMut = useMutation({
    mutationFn: () => daoToggleLike(video.id, user?.id ?? null),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['feed'] });
    },
  });

  const onLike = () => {
    if (!user) {
      showAuthRequired('登录后即可点赞,留下你的足迹 ❤️', () => router.push('/auth/login'));
      return;
    }
    // 保留点赞动画（乐观）
    if (!video.is_liked) {
      heartScale.value = withSequence(
        withSpring(1.35, { damping: 6, stiffness: 320 }),
        withSpring(1, { damping: 10, stiffness: 220 }),
      );
    }
    likeMut.mutate();
  };
  const onRemix = () => {
    if (!user) {
      showAuthRequired('登录后即可在他人作品上续写、Remix ✨', () => router.push('/auth/login'));
      return;
    }
    router.push(`/remix/${video.id}`);
  };
  const onEdit = () => {
    if (!user) {
      showAuthRequired('登录后即可剪辑发布 ✂️', () => router.push('/auth/login'));
      return;
    }
    router.push(`/editor/${video.id}`);
  };
  const onShare = async () => {
    try {
      await Share.share({
        message: `在 AI Shorts 看到一条不错的视频:${video.prompt}`,
      });
    } catch {
      // 用户取消分享,忽略
    }
  };

  const liked = !!video.is_liked;
  const finalCommentCount = commentCount > 0 ? commentCount : (video.stats?.comment_count ?? 0);

  const overlayUi = (
    <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, { justifyContent: 'flex-end' }]}>
      <View pointerEvents="box-none" style={[styles.bottomLeft, { bottom: tabBarHeight + 16 }]}>
        <Pressable hitSlop={4} onPress={() => router.push(`/video/${video.id}`)}>
          <Text style={styles.author}>@{video.author?.username ?? 'unknown'}</Text>
        </Pressable>
        <Text style={styles.prompt} numberOfLines={3}>{video.prompt}</Text>
        {video.remix_kind && (
          <View style={styles.badge}>
            <GitBranch color="#fff" size={11} />
            <Text style={styles.badgeText}>{kindLabel(video.remix_kind)} · 来自原作者</Text>
          </View>
        )}
      </View>
      <View pointerEvents="box-none" style={[styles.sideBar, { bottom: tabBarHeight + 30 }]}>
        <SideBtn
          onPress={onLike}
          icon={
            <Animated.View style={heartStyle}>
              <Heart size={32} color={liked ? colors.primary : '#fff'} fill={liked ? colors.primary : 'transparent'} strokeWidth={1.8} />
            </Animated.View>
          }
          label={fmt(video.stats?.like_count)}
        />
        <SideBtn onPress={() => setCommentsOpen(true)} icon={<MessageCircle size={30} color="#fff" strokeWidth={1.8} />} label={fmt(finalCommentCount)} />
        <SideBtn onPress={onRemix} icon={<GitBranch size={28} color="#fff" strokeWidth={1.8} />} label={fmt(video.stats?.fork_count)} />
        <SideBtn onPress={onEdit} icon={<Scissors size={26} color="#fff" strokeWidth={1.8} />} label="剪辑" />
        <SideBtn onPress={onShare} icon={<Share2 size={26} color="#fff" strokeWidth={1.8} />} label="分享" />
      </View>
    </View>
  );

  return (
    <>
      {isActive ? (
        <VideoPlayer
          videoUrl={video.video_url}
          editMetadata={video.edit_metadata}
          isActive
          looping
          showProgress
          progressBottomOffset={tabBarHeight}
          overlay={overlayUi}
        />
      ) : (
        <View style={styles.idleRoot}>
          {video.thumbnail_url ? (
            <Image source={{ uri: video.thumbnail_url }} style={StyleSheet.absoluteFill} resizeMode="cover" blurRadius={2} />
          ) : null}
          <View pointerEvents="none" style={StyleSheet.absoluteFill}>
            <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.35)' }]} />
          </View>
          {overlayUi}
        </View>
      )}
      <CommentsSheet
        videoId={video.id}
        visible={commentsOpen}
        onClose={() => setCommentsOpen(false)}
      />
    </>
  );
}

function SideBtn({ icon, label, onPress }: { icon: React.ReactNode; label: string; onPress: () => void }) {
  return (
    <Pressable style={styles.sideBtn} onPress={onPress} hitSlop={6}>
      {icon}
      <Text style={styles.sideLabel}>{label}</Text>
    </Pressable>
  );
}

function kindLabel(k: NonNullable<Video['remix_kind']>) {
  return k === 'continuation' ? '续写' : k === 'prompt_remix' ? 'Remix' : '剪辑';
}

function fmt(n: number | undefined) {
  if (!n) return '0';
  if (n < 1000) return String(n);
  if (n < 10_000) return (n / 1000).toFixed(1) + 'k';
  return (n / 10_000).toFixed(1) + '万';
}

const styles = StyleSheet.create({
  idleRoot: { flex: 1, backgroundColor: '#000' },
  bottomLeft: {
    position: 'absolute',
    left: spacing.lg,
    right: 92,
    gap: 6,
  },
  author: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
    textShadowColor: 'rgba(0,0,0,0.55)',
    textShadowRadius: 6,
  },
  prompt: {
    color: '#fff',
    fontSize: 14,
    lineHeight: 20,
    textShadowColor: 'rgba(0,0,0,0.65)',
    textShadowRadius: 4,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.18)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    marginTop: 6,
  },
  badgeText: { color: '#fff', ...typography.tiny },

  sideBar: {
    position: 'absolute',
    right: 10,
    alignItems: 'center',
    gap: 22,
  },
  sideBtn: { alignItems: 'center', gap: 4 },
  sideLabel: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
    textShadowColor: 'rgba(0,0,0,0.55)',
    textShadowRadius: 3,
  },
});
