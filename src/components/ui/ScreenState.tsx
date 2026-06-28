import type { ReactNode } from 'react';
import { View, Text, ActivityIndicator, Pressable, StyleSheet } from 'react-native';
import { AlertCircle } from 'lucide-react-native';
import { colors, radius, spacing, typography } from '@/theme';

export function LoadingState({ text }: { text?: string }) {
  return (
    <View style={styles.center}>
      <ActivityIndicator color={colors.primary} />
      {text ? <Text style={styles.sub}>{text}</Text> : null}
    </View>
  );
}

export function ErrorState({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <View style={styles.center}>
      <AlertCircle color={colors.danger} size={32} />
      <Text style={styles.title}>出错了</Text>
      <Text style={styles.sub}>{message ?? '加载失败，请重试'}</Text>
      {onRetry ? (
        <Pressable style={styles.btn} onPress={onRetry}>
          <Text style={styles.btnText}>重试</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function EmptyState({
  title, subtitle, icon, cta,
}: { title: string; subtitle?: string; icon?: ReactNode; cta?: { label: string; onPress: () => void } }) {
  return (
    <View style={styles.center}>
      {icon ? <View style={styles.iconWrap}>{icon}</View> : null}
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.sub}>{subtitle}</Text> : null}
      {cta ? (
        <Pressable style={styles.btn} onPress={cta.onPress}>
          <Text style={styles.btnText}>{cta.label}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.sm, backgroundColor: '#000' },
  iconWrap: {
    width: 72, height: 72, borderRadius: 36, backgroundColor: colors.primarySoft,
    alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm,
  },
  title: { ...typography.h1, color: colors.text },
  sub: { ...typography.body, color: colors.textMuted, textAlign: 'center' },
  btn: {
    marginTop: spacing.md, paddingHorizontal: spacing.xxl, paddingVertical: spacing.md,
    backgroundColor: colors.primary, borderRadius: radius.pill,
  },
  btnText: { ...typography.button, color: '#fff' },
});
