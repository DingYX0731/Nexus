import { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, LayoutChangeEvent } from 'react-native';
import { VideoView, useVideoPlayer } from 'expo-video';
import Animated, {
  useSharedValue, useAnimatedStyle, withTiming, withSequence, runOnJS,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Play } from 'lucide-react-native';
import { colors } from '@/theme';

export interface PlayerClip {
  videoUrl: string;
  durationMs?: number | null;
}

interface VideoPlayerProps {
  videoUrl: string;
  /**
   * 续写连贯播放：一组片段(root→leaf)。传入时播放器会依次无缝连播，
   * playToEnd 自动 replace 下一段，进度条反映整条链的总进度。
   * 不传则回退到单 videoUrl 行为（feed 等）。
   */
  clips?: PlayerClip[];
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
  videoUrl, clips, isActive, muted = false, looping = true, overlay,
  showProgress = true, progressBottomOffset = 0,
}: VideoPlayerProps) {
  // clips 模式：多段连播；否则单段。用 useMemo 稳定引用。
  const clipList = useMemo<PlayerClip[]>(
    () => (clips && clips.length > 0 ? clips : [{ videoUrl }]),
    [clips, videoUrl],
  );
  const isChain = clipList.length > 1;

  // clips 模式下播放器自己接管连播，关掉原生 loop（靠 playToEnd 手动接段）
  const player = useVideoPlayer(clipList[0]!.videoUrl, (p) => {
    p.loop = looping && !isChain;
    p.muted = muted;
    p.timeUpdateEventInterval = 0.25;
  });

  // 当前播放到第几段
  const clipIndexRef = useRef(0);
  const [clipIndex, setClipIndex] = useState(0);

  // 每段时长(秒)。片段都是 5s，未知时默认 5，播放时用 player.duration 校准。
  const DEFAULT_CLIP_SEC = 5;
  const clipDurationsRef = useRef<number[]>(
    clipList.map((c) => (c.durationMs && c.durationMs > 0 ? c.durationMs / 1000 : DEFAULT_CLIP_SEC)),
  );
  useEffect(() => {
    clipDurationsRef.current = clipList.map(
      (c) => (c.durationMs && c.durationMs > 0 ? c.durationMs / 1000 : DEFAULT_CLIP_SEC),
    );
  }, [clipList]);

  const [isPlaying, setIsPlaying] = useState(true);
  const [progress, setProgress] = useState(0); // 0..1, 整条链的总进度
  const [duration, setDuration] = useState(0); // 整条链总时长(秒)
  const [scrubProgress, setScrubProgress] = useState<number | null>(null); // 用户拖动中的临时位置
  const [trackWidth, setTrackWidth] = useState(0);
  const userPausedRef = useRef(false);
  const wasPlayingBeforeScrubRef = useRef(false);
  const switchingRef = useRef(false); // 换段进行中，避免重复触发

  // 切到第 idx 段：用 replaceAsync 等新片段加载好再 play，避免交界处卡住/需手动点。
  // seekTo 传入则在加载后 seek 到段内时间（跨段拖动用）。
  //
  // 关键：换段后不能只靠 replaceAsync().then(play) —— replaceAsync resolve 时新片段
  // 未必到了可播状态，此时 play() 会被忽略，表现为「交界处暂停、需手点」。
  // 改为状态驱动：置 pendingPlayRef，等 statusChange 变 readyToPlay 时（见下方监听）再 play。
  const pendingPlayRef = useRef(false);
  const pendingSeekRef = useRef<number | undefined>(undefined);
  const unmountedRef = useRef(false);         // 组件已卸载 → 原生 player 可能已释放，禁止再访问
  const fallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 卸载时清理：标记 unmounted + 清掉兜底定时器，避免删视频后回调访问已释放的 player 崩溃。
  useEffect(() => () => {
    unmountedRef.current = true;
    if (fallbackTimerRef.current) clearTimeout(fallbackTimerRef.current);
  }, []);

  const switchToClip = (idx: number, autoPlay: boolean, seekTo?: number) => {
    if (idx < 0 || idx >= clipList.length || unmountedRef.current) return;
    clipIndexRef.current = idx;
    setClipIndex(idx);
    switchingRef.current = true;
    pendingPlayRef.current = autoPlay;
    pendingSeekRef.current = seekTo;
    // 先尝试同步 replace（部分平台 replace 已够快），真正的 play 交给 statusChange。
    try { player.replace(clipList[idx]!.videoUrl); } catch {
      try { player.replaceAsync(clipList[idx]!.videoUrl); } catch {}
    }
    // 兜底：若新片段已就绪（statusChange 可能不再触发），下一 tick 直接尝试播放。
    if (fallbackTimerRef.current) clearTimeout(fallbackTimerRef.current);
    fallbackTimerRef.current = setTimeout(() => {
      fallbackTimerRef.current = null;
      if (unmountedRef.current || !switchingRef.current) return;
      try {
        if (player.status === 'readyToPlay') tryFlushPending();
      } catch { /* player 已释放，忽略 */ }
    }, 60);
  };

  // 尝试执行挂起的 play/seek —— 只在片段就绪后调用。player 可能已释放，全程容错。
  const tryFlushPending = () => {
    if (unmountedRef.current) return;
    try {
      if (pendingSeekRef.current != null) {
        player.currentTime = pendingSeekRef.current;
        pendingSeekRef.current = undefined;
      }
      if (pendingPlayRef.current) {
        if (isActiveRef.current && !userPausedRef.current) player.play();
        pendingPlayRef.current = false;
      }
    } catch { /* player 已释放，忽略 */ }
    switchingRef.current = false;
  };

  // Big play icon overlay animation
  const playIconScale = useSharedValue(0);

  // 记录 active 状态供异步回调读取（闭包里不能直接依赖 isActive）
  const isActiveRef = useRef(isActive);
  useEffect(() => { isActiveRef.current = isActive; }, [isActive]);

  const totalDuration = () => clipDurationsRef.current.reduce((a, b) => a + b, 0);
  const elapsedBefore = (idx: number) =>
    clipDurationsRef.current.slice(0, idx).reduce((a, b) => a + b, 0);

  // Subscribe to player events
  useEffect(() => {
    const subPlaying = player.addListener('playingChange', ({ isPlaying: p }) => setIsPlaying(p));
    // 片段就绪即执行挂起的 seek/play：这是修复「交界处暂停需手点」的关键。
    const subStatus = player.addListener('statusChange', ({ status }) => {
      if (status === 'readyToPlay' && switchingRef.current) {
        tryFlushPending();
      }
    });
    const subTime = player.addListener('timeUpdate', ({ currentTime }) => {
      const dur = player.duration;
      const i = clipIndexRef.current;
      // 用真实时长校准当前段
      if (dur && dur > 0) clipDurationsRef.current[i] = dur;
      const total = totalDuration();
      setDuration(total);
      if (scrubProgress == null && total > 0) {
        const globalTime = elapsedBefore(i) + Math.min(currentTime, clipDurationsRef.current[i] ?? currentTime);
        setProgress(Math.min(1, Math.max(0, globalTime / total)));
      }
    });
    // 链模式：一段播完自动接下一段；最后一段结束按 looping 决定回到第 0 段
    const subEnd = player.addListener('playToEnd', () => {
      if (!isChain) return;
      const next = clipIndexRef.current + 1;
      if (next < clipList.length) {
        switchToClip(next, true);
      } else if (looping) {
        switchToClip(0, true);
      }
    });
    return () => {
      subPlaying.remove();
      subStatus.remove();
      subTime.remove();
      subEnd.remove();
    };
  }, [player, scrubProgress, isChain, clipList, looping]);

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

  // 切换到新的一组片段(打开另一个视频)时，回到第 0 段从头播。
  // 跳过首次挂载（player 已用 clipList[0] 初始化，无需重复 replace）。
  const didMountRef = useRef(false);
  useEffect(() => {
    if (!didMountRef.current) { didMountRef.current = true; return; }
    setProgress(0);
    switchToClip(0, true);
    // clipList 引用变化即视为换了内容
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clipList]);

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
    const total = duration > 0 ? duration : totalDuration();
    if (total > 0) {
      if (isChain) {
        // 把全局进度映射到 (第几段, 段内时间)，跨段则先 replace 到目标段再 seek
        const target = p * total;
        const durs = clipDurationsRef.current;
        let acc = 0;
        let idx = 0;
        while (idx < durs.length - 1 && acc + (durs[idx] ?? 0) <= target) {
          acc += durs[idx] ?? 0;
          idx++;
        }
        const localTime = Math.max(0, target - acc);
        if (idx !== clipIndexRef.current) {
          // 跨段：加载目标段后再 seek + 恢复播放
          switchToClip(idx, wasPlayingBeforeScrubRef.current, localTime);
          setProgress(p);
          setScrubProgress(null);
          return;
        }
        try { player.currentTime = localTime; } catch {}
      } else {
        try { player.currentTime = p * total; } catch {}
      }
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
          // Android：换段(replaceAsync)时不拉起遮罩，保留上一帧，减少交界处黑屏闪烁
          useExoShutter={false}
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
