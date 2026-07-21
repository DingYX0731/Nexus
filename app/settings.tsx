import { View, Text, Pressable, StyleSheet, ScrollView, Alert, Share } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  X, User as UserIcon, Coins, Bell, Shield, Info,
  HelpCircle, LogOut, ChevronRight, FileText, Pencil,
} from 'lucide-react-native';
import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { colors, radius, spacing, typography } from '@/theme';
import { useAuth } from '@/store/auth';
import { useCredits, FREE_INITIAL_CREDITS } from '@/store/credits';
import { hasSupabase } from '@/api/client';
import { useLocalVideos } from '@/store/videos';
import { listMyVideos } from '@/api/videos';
import { grantCreditsRemote } from '@/api/supabase/creditsRepo';
import { showToast } from '@/components/toast/Toast';
import { CreditsDisplay } from '@/components/ui/CreditsDisplay';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { getProfile } from '@/api/supabase/profilesRepo';
import { AiProviderSection } from '@/components/settings/AiProviderSection';
import { LanguageSection } from '@/components/settings/LanguageSection';
import { useT } from '@/i18n';

export default function SettingsScreen() {
  const router = useRouter();
  const t = useT();
  const { user, isAnonymous, signOut } = useAuth();
  const creditsMap = useCredits((s) => s.byUser);
  const ensureCreditsInit = useCredits((s) => s.ensureInit);
  const syncRemote = useCredits((s) => s.syncRemote);
  const grant = useCredits((s) => s.grant);
  const videos = useLocalVideos((s) => s.videos);

  // 领取演示额度：Supabase 模式走云端 RPC 落库后 resync（否则本地 +5 会被下次 sync 覆盖，
  // 且 generate-video 读的是云端余额，本地加的额度根本用不了）；保底模式才用本地 grant。
  const grantDemoCredits = async () => {
    if (!user) return;
    if (hasSupabase) {
      try {
        await grantCreditsRemote(5);
        await syncRemote(user.id);
        showToast({ message: t('settings.addedCredits') });
      } catch (e: any) {
        showToast({ message: `${e?.message ?? '...'}`, durationMs: 4000 });
      }
    } else {
      grant(user.id, 5);
      showToast({ message: t('settings.addedCredits') });
    }
  };

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

  const { data: profile } = useQuery({
    queryKey: ['profile', user?.id],
    queryFn: () => getProfile(user!.id),
    enabled: hasSupabase && !!user && !isAnonymous,
  });

  // 作品数：Supabase 模式从云端读（与个人页同一 queryKey 复用缓存）；保底模式读本地。
  const { data: myVideos = [] } = useQuery({
    queryKey: ['myVideos', user?.id],
    queryFn: () => listMyVideos(user?.id),
    enabled: hasSupabase && !!user && !isAnonymous,
  });
  const myVideoCount = hasSupabase
    ? myVideos.length
    : (user ? videos.filter((v) => v.author_id === user.id).length : 0);

  const onLogout = () => {
    Alert.alert(t('settings.logoutConfirm'), t('settings.logoutMsg'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('settings.logout'), style: 'destructive', onPress: () => {
        void signOut();
        router.back();
        showToast({ message: t('settings.loggedOut') });
      }},
    ]);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Pressable hitSlop={12} onPress={() => router.back()}>
          <X color={colors.text} size={24} />
        </Pressable>
        <Text style={styles.headerTitle}>{t('settings.title')}</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* 用户信息卡片 */}
        {!isAnonymous && user && (
          <View style={styles.profileCard}>
            <UserAvatar user={{ username: user.username, avatar_url: profile?.avatar_url ?? null }} size={48} />
            <View style={{ flex: 1 }}>
              <Text style={styles.profileName}>@{user.username}</Text>
              <Text style={styles.profileMeta}>{myVideoCount} · {credits}</Text>
            </View>
          </View>
        )}

        {/* 编辑资料入口 */}
        {hasSupabase && !isAnonymous && (
          <View style={styles.sectionBody}>
            <Row
              icon={<Pencil color={colors.text} size={18} />}
              label={t('settings.editProfile')}
              onPress={() => router.push('/profile/edit' as any)}
              chevron
            />
          </View>
        )}

        {/* 账户 */}
        <Section title={t('settings.section.account')}>
          <Row
            icon={<UserIcon color={colors.text} size={18} />}
            label={t('settings.accountInfo')}
            value={isAnonymous ? t('settings.anonymous') : user?.username ? `@${user.username}` : ''}
            onPress={() => {
              if (isAnonymous) router.push('/auth/login');
            }}
            chevron
          />
          <Row
            icon={<Coins color={colors.warning} size={18} />}
            label={t('settings.credits')}
            rightNode={<CreditsDisplay />}
            onPress={() => {
              if (!user) return;
              Alert.alert(t('settings.getCredits'), t('settings.getCreditsMsg'), [
                { text: t('common.ok') },
                { text: t('settings.addDemoCredits'), onPress: () => { void grantDemoCredits(); }},
              ]);
            }}
            chevron
          />
        </Section>

        {/* 创作：AI 服务商 + 自带 API Key */}
        <AiProviderSection />

        {/* 语言 */}
        <LanguageSection />

        {/* 通知 */}
        <Section title={t('settings.section.notify')}>
          <Row icon={<Bell color={colors.text} size={18} />} label={t('settings.notifyPush')} value={t('settings.notifyOn')} note={t('settings.comingSoon')} />
        </Section>

        {/* 关于 */}
        <Section title={t('settings.section.about')}>
          <Row
            icon={<Info color={colors.text} size={18} />}
            label={t('settings.about')}
            onPress={() => Alert.alert('AI Shorts', 'COMP7506 · v0.1.0')}
            chevron
          />
          <Row
            icon={<Shield color={colors.text} size={18} />}
            label={t('settings.privacy')}
            onPress={() => Alert.alert(t('settings.privacy'), 'demo')}
            chevron
          />
          <Row
            icon={<FileText color={colors.text} size={18} />}
            label={t('settings.terms')}
            onPress={() => Alert.alert(t('settings.terms'), 'demo')}
            chevron
          />
          <Row
            icon={<HelpCircle color={colors.text} size={18} />}
            label={t('settings.feedback')}
            onPress={() => Share.share({ message: 'AI Shorts' }).catch(() => undefined)}
            chevron
          />
        </Section>

        {/* 退出登录 */}
        {!isAnonymous && (
          <View style={{ marginTop: spacing.xl }}>
            <Pressable style={styles.logoutBtn} onPress={onLogout}>
              <LogOut color={colors.danger} size={18} />
              <Text style={styles.logoutText}>{t('settings.logout')}</Text>
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
