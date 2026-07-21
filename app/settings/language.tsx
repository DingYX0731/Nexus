// 二级页：语言设置（从设置页点入）。
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { colors, spacing, typography } from '@/theme';
import { LanguageSection } from '@/components/settings/LanguageSection';
import { useT } from '@/i18n';

export default function LanguageScreen() {
  const router = useRouter();
  const t = useT();
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Pressable hitSlop={12} onPress={() => router.back()}>
          <ChevronLeft color={colors.text} size={26} />
        </Pressable>
        <Text style={styles.title}>{t('settings.language')}</Text>
        <View style={{ width: 26 }} />
      </View>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <LanguageSection />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
  },
  title: { ...typography.h3, color: colors.text },
  content: { padding: spacing.lg, gap: spacing.lg },
});
