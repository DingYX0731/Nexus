import type { ReactNode } from 'react';
import { View, Text, ActivityIndicator, Pressable, StyleSheet } from 'react-native';
import { AlertCircle } from 'lucide-react-native';
import { colors, radius, spacing, typography } from '@/theme';
import { useT } from '@/i18n';

export function LoadingState({ text }: { text?: string }) {
  return (
    <View style={styles.center}>
      <ActivityIndicator color={colors.primary} />
      {text ? <Text style={styles.sub}>{text}</Text> : null}
    </View>
  );
}

export function ErrorState({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  const t = useT();
  return (
    <View style={styles.center}>
      <AlertCircle color={colors.danger} size={32} />
      <Text style={styles.title}>{t('state.error')}</Text>
      <Text style={styles.sub}>{message ?? t('state.loadFailed')}</Text>
      {onRetry ? (
        <Pressable style={styles.btn} onPress={onRetry}>
          <Text style={styles.btnText}>{t('common.retry')}</Text>
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
