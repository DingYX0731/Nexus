import { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, LayoutChangeEvent } from 'react-native';
import { VideoView, useVideoPlayer } from 'expo-video';
import Animated, {
  useSharedValue, useAnimatedStyle, withTiming, withSequence, runOnJS,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Play } from 'lucide-react-native';
import { colors } from '@/theme';

interface VideoPlayerProps {
  videoUrl: string;
  isActive: boolean;
  muted?: boolean;
  looping?: boolean;
  /** Render absolute overlay UI (action bar, captions wrapper) inside the player. */
  overlay?: React.ReactNode;
  /** If true, exposes a thin progress bar that the user can drag to seek. */
  showProgress?: boolean;
  /** px from the bottom for the progress bar (to clear tab bar / safe area). */
  progressBottomOffset?: number;
}

export function VideoPlayer({
  videoUrl, isActive, muted = false, looping = true, overlay,
  showProgress = true, progressBottomOffset = 0,
}: VideoPlayerProps) {
  const player = useVideoPlayer(videoUrl, (p) => {
    p.loop = looping;
    p.muted = muted;
    p.timeUpdateEventInterval = 0.25;
  });

  const [isPlaying, setIsPlaying] = useState(true);
  const [progress, setProgress] = useState(0); // 0..1, current playback progress (from player events)
  const [duration, setDuration] = useState(0);
  const [scrubProgress, setScrubProgress] = useState<number | null>(null); // 用户拖动中的临时位置
  const [trackWidth, setTrackWidth] = useState(0);
  const userPausedRef = useRef(false);
  const wasPlayingBeforeScrubRef = useRef(false);

  // Big play icon overlay animation
  const playIconScale = useSharedValue(0);

  // Subscribe to player events
  useEffect(() => {
    const subPlaying = player.addListener('playingChange', ({ isPlaying: p }) => setIsPlaying(p));
    const subTime = player.addListener('timeUpdate', ({ currentTime }) => {
      const dur = player.duration;
      if (dur && dur > 0) {
        setDuration(dur);
        // 拖动中不要被自动时间更新覆盖
        if (scrubProgress == null) {
          setProgress(Math.min(1, Math.max(0, currentTime / dur)));
        }
      }
    });
    return () => {
      subPlaying.remove();
      subTime.remove();
    };
  }, [player, scrubProgress]);

  // Activation: auto play/pause on slide
  useEffect(() => {
    if (isActive && !userPausedRef.current) {
      player.play();
    } else if (!isActive) {
      player.pause();
    }
  }, [isActive, player]);

  useEffect(() => { player.muted = muted; }, [muted, player]);

  useEffect(() => {
    if (isActive) userPausedRef.current = false;
  }, [isActive]);

  const togglePlay = () => {
    if (player.playing) {
      player.pause();
      userPausedRef.current = true;
      flashPlayIcon();
    } else {
      player.play();
      userPausedRef.current = false;
    }
  };

  const flashPlayIcon = () => {
    playIconScale.value = 0.6;
    playIconScale.value = withSequence(
      withTiming(1, { duration: 160 }),
      withTiming(1, { duration: 1 }),
    );
  };

  const playIconStyle = useAnimatedStyle(() => ({
    opacity: isPlaying ? 0 : 1,
    transform: [{ scale: playIconScale.value }],
  }));

  // 进度条拖动:Pan 手势,activate 时记下当前播放状态,end 时 seek + 恢复
  const onScrubStart = (initialProgress: number) => {
    wasPlayingBeforeScrubRef.current = player.playing;
    if (player.playing) player.pause();
    setScrubProgress(initialProgress);
  };
  const onScrubMove = (p: number) => {
    setScrubProgress(p);
  };
  const onScrubEnd = (p: number) => {
    if (duration > 0) {
      try { player.currentTime = p * duration; } catch {}
    }
    setProgress(p);
    setScrubProgress(null);
    if (wasPlayingBeforeScrubRef.current) player.play();
  };

  // Pan gesture — minDistance 0 让 tap 也能 seek
  const pan = Gesture.Pan()
    .minDistance(0)
    .onStart((e) => {
      if (trackWidth === 0) return;
      const p = clamp(e.x / trackWidth, 0, 1);
      runOnJS(onScrubStart)(p);
    })
    .onUpdate((e) => {
      if (trackWidth === 0) return;
      const p = clamp(e.x / trackWidth, 0, 1);
      runOnJS(onScrubMove)(p);
    })
    .onEnd((e) => {
      if (trackWidth === 0) return;
      const p = clamp(e.x / trackWidth, 0, 1);
      runOnJS(onScrubEnd)(p);
    });

  const onTrackLayout = (e: LayoutChangeEvent) => {
    setTrackWidth(e.nativeEvent.layout.width);
  };

  const visualProgress = scrubProgress ?? progress;
  const isScrubbing = scrubProgress != null;

  return (
    <View style={styles.root}>
      <Pressable style={styles.tapLayer} onPress={togglePlay}>
        <VideoView
          player={player}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          nativeControls={false}
          allowsPictureInPicture={false}
        />
        <Animated.View pointerEvents="none" style={[styles.playIconWrap, playIconStyle]}>
          <View style={styles.playIconBg}>
            <Play color="#fff" size={42} fill="#fff" />
          </View>
        </Animated.View>

        {overlay && <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>{overlay}</View>}
      </Pressable>

      {/* Progress bar layer:覆盖在 Pressable 之上,所以 pan 不会被 tap 吃掉 */}
      {showProgress && (
        <View
          style={[styles.scrubLayer, { bottom: progressBottomOffset }]}
          onLayout={onTrackLayout}
          pointerEvents="box-none"
        >
          {/* 拖动时显示时间 tooltip */}
          {isScrubbing && duration > 0 && (
            <View
              pointerEvents="none"
              style={[
                styles.timeTooltip,
                { left: `${visualProgress * 100}%` },
              ]}
            >
              <Text style={styles.timeTooltipText}>
                {formatTime(visualProgress * duration)} / {formatTime(duration)}
              </Text>
            </View>
          )}
          <GestureDetector gesture={pan}>
            <View style={styles.scrubHit}>
              <View style={[styles.progressTrack, isScrubbing && styles.progressTrackActive]}>
                <View style={[styles.progressFill, { width: `${visualProgress * 100}%` }]} />
                {/* Thumb dot — 拖动时变大 */}
                <View
                  pointerEvents="none"
                  style={[
                    styles.thumb,
                    isScrubbing && styles.thumbActive,
                    { left: `${visualProgress * 100}%` },
                  ]}
                />
              </View>
            </View>
          </GestureDetector>
        </View>
      )}
    </View>
  );
}

function clamp(x: number, lo: number, hi: number) {
  'worklet';
  return Math.max(lo, Math.min(hi, x));
}

function formatTime(sec: number): string {
  if (!isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000', overflow: 'hidden' },
  tapLayer: { ...StyleSheet.absoluteFillObject },

  playIconWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playIconBg: {
    width: 88, height: 88, borderRadius: 44,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center', justifyContent: 'center',
  },

  // 进度条:scrubLayer 是定位容器,scrubHit 提供 16px 触摸高度增大命中区域
  scrubLayer: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 24,
    justifyContent: 'flex-end',
  },
  scrubHit: { height: 24, justifyContent: 'flex-end' },
  progressTrack: {
    height: 2,
    backgroundColor: 'rgba(255,255,255,0.22)',
    justifyContent: 'center',
  },
  progressTrackActive: { height: 4 },
  progressFill: { height: '100%', backgroundColor: colors.primary, borderRadius: 1 },
  thumb: {
    position: 'absolute',
    width: 12, height: 12, borderRadius: 6,
    backgroundColor: '#fff',
    marginLeft: -6,
    top: '50%',
    marginTop: -6,
    opacity: 0,
  },
  thumbActive: {
    opacity: 1,
    width: 16, height: 16, borderRadius: 8, marginLeft: -8, marginTop: -8,
  },

  timeTooltip: {
    position: 'absolute',
    bottom: 30,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: 'rgba(0,0,0,0.75)',
    borderRadius: 6,
    transform: [{ translateX: -40 }],
    minWidth: 80,
    alignItems: 'center',
  },
  timeTooltipText: { color: '#fff', fontSize: 11, fontWeight: '600' },
});
