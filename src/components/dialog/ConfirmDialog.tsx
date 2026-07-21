// 全局确认对话框 —— 居中 modal,backdrop 暗化全屏。
// 主要用途:登录引导(点赞/评论/续写等需要登录的操作触发)。
//
// 用法:
//   import { showAuthRequired } from '@/components/dialog/ConfirmDialog';
//   showAuthRequired('登录后即可点赞', () => router.push('/auth/login'));
//
// 在 RootLayout 里挂载一次 <ConfirmDialogHost />。
import { useEffect } from 'react';
import { View, Text, Pressable, StyleSheet, Modal, Dimensions } from 'react-native';
import { create } from 'zustand';
import { t as translate } from '@/i18n';
import Animated, {
  useAnimatedStyle, useSharedValue, withTiming, withSpring, runOnJS,
} from 'react-native-reanimated';
import { Sparkles, X } from 'lucide-react-native';
import { colors, radius, spacing, typography } from '@/theme';

const { width: SCREEN_W } = Dimensions.get('window');

interface DialogConfig {
  id: number;
  title: string;
  message: string;
  primaryLabel: string;
  secondaryLabel?: string;
  onPrimary: () => void;
  onSecondary?: () => void;
  icon?: 'sparkles' | 'lock'; // 可扩展
}

interface DialogStore {
  current: DialogConfig | null;
  show: (cfg: Omit<DialogConfig, 'id'>) => void;
  hide: () => void;
}

let _seq = 1;
const useDialogStore = create<DialogStore>((set) => ({
  current: null,
  show: (cfg) => set({ current: { ...cfg, id: _seq++ } }),
  hide: () => set({ current: null }),
}));

export function showDialog(cfg: Omit<DialogConfig, 'id'>) {
  useDialogStore.getState().show(cfg);
}

export function hideDialog() {
  useDialogStore.getState().hide();
}

/** 快捷方式:登录引导对话框 */
export function showAuthRequired(message: string, onGoLogin: () => void) {
  showDialog({
    title: translate('dialog.loginTitle'),
    message,
    primaryLabel: translate('dialog.loginPrimary'),
    secondaryLabel: translate('dialog.loginSecondary'),
    onPrimary: onGoLogin,
    icon: 'sparkles',
  });
}

export function ConfirmDialogHost() {
  const current = useDialogStore((s) => s.current);
  const hide = useDialogStore((s) => s.hide);

  const backdropOpacity = useSharedValue(0);
  const cardScale = useSharedValue(0.85);
  const cardOpacity = useSharedValue(0);

  useEffect(() => {
    if (current) {
      backdropOpacity.value = withTiming(1, { duration: 180 });
      cardOpacity.value = withTiming(1, { duration: 220 });
      cardScale.value = withSpring(1, { damping: 18, stiffness: 220 });
    } else {
      backdropOpacity.value = 0;
      cardScale.value = 0.85;
      cardOpacity.value = 0;
    }
  }, [current?.id, current, backdropOpacity, cardOpacity, cardScale]);

  const dismiss = (cb?: () => void) => {
    backdropOpacity.value = withTiming(0, { duration: 160 });
    cardOpacity.value = withTiming(0, { duration: 160 });
    cardScale.value = withTiming(0.92, { duration: 160 }, (done) => {
      if (done) {
        runOnJS(hide)();
        if (cb) runOnJS(cb)();
      }
    });
  };

  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdropOpacity.value }));
  const cardStyle = useAnimatedStyle(() => ({
    opacity: cardOpacity.value,
    transform: [{ scale: cardScale.value }],
  }));

  if (!current) return null;

  return (
    <Modal visible transparent animationType="none" statusBarTranslucent>
      <View style={styles.root}>
        {/* Backdrop:点击外部关闭(走 secondary 行为 = 取消) */}
        <Animated.View style={[StyleSheet.absoluteFillObject, styles.backdrop, backdropStyle]}>
          <Pressable
            style={StyleSheet.absoluteFillObject}
            onPress={() => dismiss(current.onSecondary)}
          />
        </Animated.View>

        {/* Card */}
        <Animated.View style={[styles.card, cardStyle]} pointerEvents="box-none">
          <Pressable hitSlop={8} style={styles.closeBtn} onPress={() => dismiss(current.onSecondary)}>
            <X color={colors.textMuted} size={20} />
          </Pressable>

          <View style={styles.iconWrap}>
            <Sparkles color={colors.primary} size={28} />
          </View>

          <Text style={styles.title}>{current.title}</Text>
          <Text style={styles.message}>{current.message}</Text>

          <View style={styles.actions}>
            <Pressable
              style={styles.primaryBtn}
              onPress={() => dismiss(current.onPrimary)}
            >
              <Text style={styles.primaryText}>{current.primaryLabel}</Text>
            </Pressable>
            {current.secondaryLabel && (
              <Pressable
                style={styles.secondaryBtn}
                onPress={() => dismiss(current.onSecondary)}
              >
                <Text style={styles.secondaryText}>{current.secondaryLabel}</Text>
              </Pressable>
            )}
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const CARD_WIDTH = Math.min(SCREEN_W - 64, 340);

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  backdrop: { backgroundColor: 'rgba(0,0,0,0.75)' },
  card: {
    width: CARD_WIDTH,
    backgroundColor: colors.bgElevated,
    borderRadius: radius.xl,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: spacing.lg,
    alignItems: 'center',
    borderWidth: 1, borderColor: colors.border,
    shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 24, shadowOffset: { width: 0, height: 12 },
    elevation: 16,
  },
  closeBtn: {
    position: 'absolute',
    top: spacing.md, right: spacing.md,
    width: 32, height: 32, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
  },
  iconWrap: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: colors.primarySoft,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: spacing.md,
  },
  title: { ...typography.h2, color: colors.text, textAlign: 'center', marginBottom: spacing.sm },
  message: { ...typography.body, color: colors.textMuted, textAlign: 'center', marginBottom: spacing.lg, lineHeight: 22 },
  actions: { width: '100%', gap: spacing.sm },
  primaryBtn: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.md + 2,
    borderRadius: radius.lg,
    alignItems: 'center',
  },
  primaryText: { ...typography.button, color: '#fff' },
  secondaryBtn: { paddingVertical: spacing.md, alignItems: 'center' },
  secondaryText: { ...typography.body, color: colors.textMuted, fontWeight: '500' },
});
