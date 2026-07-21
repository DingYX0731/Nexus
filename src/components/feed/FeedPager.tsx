import { useCallback, useRef, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import PagerView, { type PagerViewOnPageSelectedEvent } from 'react-native-pager-view';
import { useIsFocused } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import type { Video } from '@/api/types';
import { VideoCard } from './VideoCard';
import { recordPlay } from '@/api/videos';
import { useAuth } from '@/store/auth';
import { showToast } from '@/components/toast/Toast';
import { t as translate } from '@/i18n';

const ANON_NUDGE_AFTER_N_VIDEOS = 3;

export function FeedPager({ videos }: { videos: Video[] }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const lastPinged = useRef<string | null>(null);
  const anonNudgeShown = useRef(false);
  const isFocused = useIsFocused();
  const router = useRouter();
  const { isAnonymous } = useAuth();

  const onPageSelected = useCallback((e: PagerViewOnPageSelectedEvent) => {
    const idx = e.nativeEvent.position;
    setActiveIndex(idx);
    const v = videos[idx];
    if (v && lastPinged.current !== v.id) {
      lastPinged.current = v.id;
      recordPlay(v.id).catch(() => undefined);
    }
    // 匿名用户刷到第 N 条时弹一次注册引导 (session 内只弹一次)
    if (isAnonymous && !anonNudgeShown.current && idx >= ANON_NUDGE_AFTER_N_VIDEOS) {
      anonNudgeShown.current = true;
      showToast({
        message: translate('feed.loginPrompt'),
        actionLabel: translate('feed.loginAction'),
        onAction: () => router.push('/auth/login'),
        durationMs: 4500,
      });
    }
  }, [videos, isAnonymous, router]);

  return (
    <PagerView
      style={styles.pager}
      orientation="vertical"
      initialPage={0}
      onPageSelected={onPageSelected}
      offscreenPageLimit={1}
    >
      {videos.map((video, idx) => (
        <View key={video.id} style={styles.page} collapsable={false}>
          <VideoCard video={video} isActive={isFocused && idx === activeIndex} />
        </View>
      ))}
    </PagerView>
  );
}

const styles = StyleSheet.create({
  pager: { flex: 1 },
  page: { flex: 1 },
});
