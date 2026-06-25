// 全局 Toast/Snackbar 系统。
//
// 用法:
//   import { showToast } from '@/components/toast/Toast';
//   showToast({ message: '登录后即可点赞', actionLabel: '去登录', onAction: () => router.push('/auth/login') });
//
// 在 RootLayout 里挂载一次 <ToastHost />。
import { useEffect } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { create } from 'zustand';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, withSpring, runOnJS } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, spacing, typography } from '@/theme';

interface ToastConfig {
  id: number;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  durationMs?: number;
}

interface ToastStore {
  current: ToastConfig | null;
  show: (cfg: Omit<ToastConfig, 'id'>) => void;
  hide: () => void;
}

let _seq = 1;
const useToastStore = create<ToastStore>((set) => ({
  current: null,
  show: (cfg) => set({ current: { ...cfg, id: _seq++ } }),
  hide: () => set({ current: null }),
}));

export function showToast(cfg: Omit<ToastConfig, 'id'>) {
  useToastStore.getState().show(cfg);
}
export function hideToast() {
  useToastStore.getState().hide();
}

export function ToastHost() {
  const current = useToastStore((s) => s.current);
  const hide = useToastStore((s) => s.hide);
  const insets = useSafeAreaInsets();

  const translateY = useSharedValue(120);
  const opacity = useSharedValue(0);

  useEffect(() => {
    if (current) {
      translateY.value = withSpring(0, { damping: 18, stiffness: 200 });
      opacity.value = withTiming(1, { duration: 180 });
      const t = setTimeout(() => {
        translateY.value = withTiming(120, { duration: 220 });
        opacity.value = withTiming(0, { duration: 220 }, (done) => {
          if (done) runOnJS(hide)();
        });
      }, current.durationMs ?? 2800);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [current?.id, current, hide, translateY, opacity]);

  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  if (!current) return null;

  // Tab bar 高度大概 56 + safe area,toast 浮在 tab bar 上方
  const bottom = (insets.bottom + 56) + 16;

  return (
    <Animated.View pointerEvents="box-none" style={[styles.host, { bottom }, animStyle]}>
      <View style={styles.toast}>
        <Text style={styles.msg} numberOfLines={2}>{current.message}</Text>
        {current.actionLabel && current.onAction && (
          <Pressable hitSlop={6} onPress={() => { current.onAction?.(); hide(); }} style={styles.actionBtn}>
            <Text style={styles.actionText}>{current.actionLabel}</Text>
          </Pressable>
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    alignItems: 'center',
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surfaceHi,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    gap: spacing.md,
    maxWidth: '100%',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
  },
  msg: { ...typography.body, color: colors.text, flex: 1 },
  actionBtn: { paddingHorizontal: spacing.sm, paddingVertical: 2 },
  actionText: { ...typography.bodyStrong, color: colors.primary },
});
