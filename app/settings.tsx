import { View, Text, Pressable, StyleSheet, ScrollView, Alert, Share } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  X, User as UserIcon, Sparkles, Coins, Bell, Shield, Info,
  HelpCircle, LogOut, ChevronRight, FileText, Pencil,
} from 'lucide-react-native';
import { useEffect } from 'react';
import { colors, radius, spacing, typography } from '@/theme';
import { useAuth } from '@/store/auth';
import { useCredits, FREE_INITIAL_CREDITS } from '@/store/credits';
import { hasSupabase } from '@/api/client';
import { useLocalVideos } from '@/store/videos';
import { defaultProvider } from '@/ai/VideoGenProvider';
import { showToast } from '@/components/toast/Toast';
import { CreditsDisplay } from '@/components/ui/CreditsDisplay';

const PROVIDER_LABEL: Record<string, string> = {
  mock: 'Mock(本地示例)',
  doubao: '豆包 Seedance',
  kling: '可灵 Kling',
};

export default function SettingsScreen() {
  const router = useRouter();
  const { user, isAnonymous, signOut } = useAuth();
  const creditsMap = useCredits((s) => s.byUser);
  const ensureCreditsInit = useCredits((s) => s.ensureInit);
  const syncRemote = useCredits((s) => s.syncRemote);
  const grant = useCredits((s) => s.grant);
  const videos = useLocalVideos((s) => s.videos);

  useEffect(() => {
    if (user) {
      if (hasSupabase) {
        void syncRemote(user.id);
      } else {
        ensureCreditsInit(user.id);
      }
    }
  }, [user, ensureCreditsInit, syncRemote]);
  const credits = user ? (creditsMap[user.id] ?? FREE_INITIAL_CREDITS) : 0;
  const myVideoCount = user ? videos.filter((v) => v.author_id === user.id).length : 0;

  const onLogout = () => {
    Alert.alert('退出登录?', '退出后将返回匿名状态。', [
      { text: '取消', style: 'cancel' },
      { text: '退出', style: 'destructive', onPress: () => {
        void signOut();
        router.back();
        showToast({ message: '已退出登录' });
      }},
    ]);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Pressable hitSlop={12} onPress={() => router.back()}>
          <X color={colors.text} size={24} />
        </Pressable>
        <Text style={styles.headerTitle}>设置</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* 用户信息卡片 */}
        {!isAnonymous && user && (
          <View style={styles.profileCard}>
            <View style={styles.avatar}>
              <Text style={styles.avatarTxt}>{user.username.slice(0, 1).toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.profileName}>@{user.username}</Text>
              <Text style={styles.profileMeta}>{myVideoCount} 个作品 · {credits} 个额度</Text>
            </View>
          </View>
        )}

        {/* 编辑资料入口 */}
        {hasSupabase && !isAnonymous && (
          <View style={styles.sectionBody}>
            <Row
              icon={<Pencil color={colors.text} size={18} />}
              label="编辑资料"
              onPress={() => router.push('/profile/edit' as any)}
              chevron
            />
          </View>
        )}

        {/* 账户 */}
        <Section title="账户">
          <Row
            icon={<UserIcon color={colors.text} size={18} />}
            label="账户信息"
            value={isAnonymous ? '匿名访客' : user?.username ? `@${user.username}` : ''}
            onPress={() => {
              if (isAnonymous) router.push('/auth/login');
            }}
            chevron
          />
          <Row
            icon={<Coins color={colors.warning} size={18} />}
            label="额度"
            rightNode={<CreditsDisplay />}
            onPress={() => {
              if (!user) return;
              Alert.alert('获取额度', '邀请好友、完成任务即可获取更多额度(敬请期待)', [
                { text: '知道了' },
                { text: '+5 额度(演示)', onPress: () => { grant(user.id, 5); showToast({ message: '已添加 5 个额度' }); }},
              ]);
            }}
            chevron
          />
        </Section>

        {/* 创作 */}
        <Section title="创作">
          <Row
            icon={<Sparkles color={colors.accent} size={18} />}
            label="AI 模型"
            value={PROVIDER_LABEL[defaultProvider.name] ?? defaultProvider.name}
            note="演示阶段固定,后续支持切换"
          />
        </Section>

        {/* 通知 */}
        <Section title="通知">
          <Row icon={<Bell color={colors.text} size={18} />} label="消息推送" value="已开启" note="敬请期待" />
        </Section>

        {/* 关于 */}
        <Section title="关于">
          <Row
            icon={<Info color={colors.text} size={18} />}
            label="关于 AI Shorts"
            onPress={() => Alert.alert('AI Shorts', 'COMP7506 课程项目 · v0.1.0\n\n用 AI 生成、续写、Remix 短视频。')}
            chevron
          />
          <Row
            icon={<Shield color={colors.text} size={18} />}
            label="隐私政策"
            onPress={() => Alert.alert('隐私政策', '当前为 demo 版本,数据仅保存在本地。')}
            chevron
          />
          <Row
            icon={<FileText color={colors.text} size={18} />}
            label="用户协议"
            onPress={() => Alert.alert('用户协议', '使用本应用即表示您同意 demo 演示用途的条款。')}
            chevron
          />
          <Row
            icon={<HelpCircle color={colors.text} size={18} />}
            label="意见反馈"
            onPress={() => Share.share({ message: '我在使用 AI Shorts,有些想法想分享…' }).catch(() => undefined)}
            chevron
          />
        </Section>

        {/* 退出登录 */}
        {!isAnonymous && (
          <View style={{ marginTop: spacing.xl }}>
            <Pressable style={styles.logoutBtn} onPress={onLogout}>
              <LogOut color={colors.danger} size={18} />
              <Text style={styles.logoutText}>退出登录</Text>
            </Pressable>
          </View>
        )}

        <Text style={styles.footer}>AI Shorts · v0.1.0 · COMP7506</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

function Row({ icon, label, value, note, onPress, chevron, rightNode }: {
  icon: React.ReactNode;
  label: string;
  value?: string;
  note?: string;
  onPress?: () => void;
  chevron?: boolean;
  rightNode?: React.ReactNode;
}) {
  const inner = (
    <View style={styles.row}>
      <View style={styles.rowIcon}>{icon}</View>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowLabel}>{label}</Text>
        {note && <Text style={styles.rowNote}>{note}</Text>}
      </View>
      {rightNode ? rightNode : value && <Text style={styles.rowValue}>{value}</Text>}
      {chevron && onPress && <ChevronRight color={colors.textMuted} size={16} />}
    </View>
  );
  return onPress ? <Pressable onPress={onPress}>{inner}</Pressable> : inner;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
  },
  headerTitle: { ...typography.h3, color: colors.text },
  content: { padding: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.lg },

  profileCard: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    padding: spacing.md, backgroundColor: colors.surface, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.border,
  },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  avatarTxt: { color: '#fff', fontSize: 20, fontWeight: '700' },
  profileName: { ...typography.h3, color: colors.text },
  profileMeta: { ...typography.caption, color: colors.textMuted, marginTop: 2 },

  section: { gap: spacing.sm },
  sectionTitle: {
    ...typography.captionStrong, color: colors.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.5, paddingHorizontal: spacing.sm,
  },
  sectionBody: { backgroundColor: colors.surface, borderRadius: radius.lg, overflow: 'hidden', borderWidth: 1, borderColor: colors.border },

  row: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingHorizontal: spacing.md, paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
  },
  rowIcon: { width: 28, alignItems: 'center' },
  rowLabel: { ...typography.body, color: colors.text },
  rowNote: { ...typography.tiny, color: colors.textDim, marginTop: 2 },
  rowValue: { ...typography.caption, color: colors.textMuted, maxWidth: 160, textAlign: 'right' },

  logoutBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    paddingVertical: spacing.md, backgroundColor: colors.surface,
    borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border,
  },
  logoutText: { ...typography.bodyStrong, color: colors.danger },

  footer: { ...typography.tiny, color: colors.textDim, textAlign: 'center', marginTop: spacing.lg },
});
