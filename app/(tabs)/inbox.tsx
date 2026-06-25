import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Bell, Heart, GitBranch, MessageCircle, UserPlus } from 'lucide-react-native';
import { colors, radius, spacing, typography } from '@/theme';
import { useTabBarSpace } from '@/hooks/useTabBarSpace';

const MOCK_NOTIFICATIONS = [
  { id: 'n1', kind: 'fork', who: 'luna', what: '续写了你的视频', when: '2小时前', target: '深海蓝鲸缓缓游过镜头…' },
  { id: 'n2', kind: 'like', who: 'kira', what: '赞了你的视频', when: '今天', target: '一只穿宇航服的橘猫…' },
  { id: 'n3', kind: 'comment', who: '小红', what: '回复了你: "太治愈了!"', when: '昨天', target: '梦境穿越,海底珊瑚…' },
  { id: 'n4', kind: 'follow', who: 'echo', what: '关注了你', when: '3天前', target: null },
];

const ICONS: Record<string, React.ReactNode> = {
  fork: <GitBranch color={colors.accent} size={18} />,
  like: <Heart color={colors.primary} size={18} fill={colors.primary} />,
  comment: <MessageCircle color={colors.text} size={18} />,
  follow: <UserPlus color={colors.success} size={18} />,
};

export default function InboxScreen() {
  const { contentBottomPad } = useTabBarSpace();
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>通知</Text>
        <Bell color={colors.textMuted} size={22} />
      </View>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: contentBottomPad }]}>
        {MOCK_NOTIFICATIONS.map((n) => (
          <View key={n.id} style={styles.row}>
            <View style={styles.iconBg}>{ICONS[n.kind]}</View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={styles.body}>
                <Text style={styles.who}>@{n.who} </Text>
                <Text style={styles.what}>{n.what}</Text>
              </Text>
              {n.target && <Text style={styles.target} numberOfLines={1}>《{n.target}》</Text>}
              <Text style={styles.when}>{n.when}</Text>
            </View>
          </View>
        ))}
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
  title: { ...typography.h1, color: colors.text },
  content: { paddingHorizontal: spacing.lg, gap: spacing.sm },
  row: {
    flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start',
    padding: spacing.md, backgroundColor: colors.surface, borderRadius: radius.md,
  },
  iconBg: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surfaceHi,
    alignItems: 'center', justifyContent: 'center',
  },
  body: { ...typography.body, color: colors.text },
  who: { ...typography.bodyStrong, color: colors.text },
  what: { ...typography.body, color: colors.textSecondary },
  target: { ...typography.caption, color: colors.textMuted },
  when: { ...typography.tiny, color: colors.textDim, marginTop: 2 },
  footnote: { ...typography.tiny, color: colors.textDim, textAlign: 'center', marginTop: spacing.lg },
});
