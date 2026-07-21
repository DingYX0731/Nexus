// 设置页「语言」区块：跟随系统 / 中文 / English 三选一。
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Languages, Check } from 'lucide-react-native';
import { colors, radius, spacing, typography } from '@/theme';
import { useI18n, useT } from '@/i18n';

export function LanguageSection() {
  const t = useT();
  const lang = useI18n((s) => s.lang);
  const followSystem = useI18n((s) => s.followSystem);
  const setLang = useI18n((s) => s.setLang);
  const useSystem = useI18n((s) => s.useSystem);

  const options: { key: 'system' | 'zh' | 'en'; label: string; active: boolean; onPress: () => void }[] = [
    { key: 'system', label: t('settings.lang.system'), active: followSystem, onPress: useSystem },
    { key: 'zh', label: t('settings.lang.zh'), active: !followSystem && lang === 'zh', onPress: () => setLang('zh') },
    { key: 'en', label: t('settings.lang.en'), active: !followSystem && lang === 'en', onPress: () => setLang('en') },
  ];

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{t('settings.language')}</Text>
      <View style={styles.body}>
        {options.map((o, i) => (
          <Pressable
            key={o.key}
            style={[styles.row, i < options.length - 1 && styles.rowBorder]}
            onPress={o.onPress}
          >
            {i === 0 && <Languages color={colors.text} size={18} style={{ marginRight: spacing.sm }} />}
            <Text style={[styles.label, i !== 0 && { marginLeft: 28 + spacing.sm }]}>{o.label}</Text>
            {o.active && <Check color={colors.primary} size={18} style={{ marginLeft: 'auto' }} />}
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.sm },
  sectionTitle: {
    ...typography.captionStrong, color: colors.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.5, paddingHorizontal: spacing.sm,
  },
  body: {
    backgroundColor: colors.surface, borderRadius: radius.lg, overflow: 'hidden',
    borderWidth: 1, borderColor: colors.border,
  },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: 14 },
  rowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  label: { ...typography.body, color: colors.text },
});
