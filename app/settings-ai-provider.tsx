// 二级页：AI 服务商 + 模型 + 自带 API Key（从设置页点入）。
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { colors, spacing, typography } from '@/theme';
import { AiProviderSection } from '@/components/settings/AiProviderSection';
import { useT } from '@/i18n';

export default function AiProviderScreen() {
  const router = useRouter();
  const t = useT();
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Pressable hitSlop={12} onPress={() => router.back()}>
          <ChevronLeft color={colors.text} size={26} />
        </Pressable>
        <Text style={styles.title}>{t('ai.provider')}</Text>
        <View style={{ width: 26 }} />
      </View>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <AiProviderSection />
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
