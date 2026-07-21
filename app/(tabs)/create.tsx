import { useState, useMemo, useEffect } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, Alert, ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Sparkles, Wand2, Lock, Clock, CheckCircle2, XCircle, ChevronRight } from 'lucide-react-native';
import { CreditsDisplay } from '@/components/ui/CreditsDisplay';
import { colors, radius, spacing, typography } from '@/theme';
import { useAiSettings, PROVIDERS } from '@/store/aiSettings';
import { useTabBarSpace } from '@/hooks/useTabBarSpace';
import { useT } from '@/i18n';
import { useAuth } from '@/store/auth';
import { useCredits, COST_GENERATION } from '@/store/credits';
import { hasSupabase } from '@/api/client';
import { useJobs, submitTextToVideo, type AiJobRecord } from '@/store/jobs';
import { showToast } from '@/components/toast/Toast';
import { showDialog } from '@/components/dialog/ConfirmDialog';
import { grantCreditsRemote } from '@/api/supabase/creditsRepo';

const PROMPT_SUGGESTION_KEYS = ['sugg.1', 'sugg.2', 'sugg.3', 'sugg.4'] as const;

export default function CreateScreen() {
  const router = useRouter();
  const t = useT();
  const { contentBottomPad } = useTabBarSpace();
  const { user, isAnonymous } = useAuth();

  // 未登录直接显示登录 wall
  if (isAnonymous || !user) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={[styles.wallContent, { paddingBottom: contentBottomPad }]}>
          <View style={styles.heroIcon}>
            <Lock color={colors.primary} size={28} />
          </View>
          <Text style={styles.title}>{t('create.needLogin')}</Text>
          <Text style={styles.sub}>{t('create.needLoginSub')}</Text>
          <Pressable style={styles.button} onPress={() => router.push('/auth/login')}>
            <Text style={styles.buttonText}>{t('create.loginRegister')}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return <CreateAuthed userId={user.id} username={user.username} contentBottomPad={contentBottomPad} />;
}

function CreateAuthed({ userId, username, contentBottomPad }:
  { userId: string; username: string; contentBottomPad: number }) {
  const router = useRouter();
  const t = useT();
  const [prompt, setPrompt] = useState('');
  const [aspect, setAspect] = useState<'9:16' | '16:9'>('9:16');

  // 关键:zustand selector 必须返回稳定的引用,所以选基础数据,再用 useMemo 派生。
  // 不要直接 useCredits((s) => s.get(userId))(get() 内部会 setState 触发循环),
  // 也不要 useJobs((s) => s.visibleFor(userId))(每次返回新数组 → getSnapshot 不稳定)。
  const creditsMap = useCredits((s) => s.byUser);
  const ensureCreditsInit = useCredits((s) => s.ensureInit);
  const syncRemote = useCredits((s) => s.syncRemote);
  const charge = useCredits((s) => s.charge);
  const refund = useCredits((s) => s.refund);

  const allJobs = useJobs((s) => s.jobs);

  useEffect(() => {
    if (hasSupabase) {
      void syncRemote(userId);
    } else {
      ensureCreditsInit(userId);
    }
  }, [userId, ensureCreditsInit, syncRemote]);

  const credits = creditsMap[userId] ?? 5; // ensureInit 之前先用默认值,避免 0 闪一下

  // AI 模型设置（provider 当前只有一个可用模型，框架已就绪，未来可扩展）
  const aiProvider = useAiSettings((s) => s.provider);
  const modelByProvider = useAiSettings((s) => s.modelByProvider);
  const setModel = useAiSettings((s) => s.setModel);
  const hasKey = useAiSettings((s) => s.hasKey);
  const refreshHasKey = useAiSettings((s) => s.refreshHasKey);
  useEffect(() => { void refreshHasKey(); }, [refreshHasKey]);
  const providerModels = PROVIDERS.find((p) => p.id === aiProvider)?.models ?? [];
  const selectedModel = modelByProvider[aiProvider] ?? providerModels[0]?.id;
  const keyConfigured = !!hasKey[aiProvider];

  const myJobs = useMemo(
    () => allJobs.filter((j) => j.ownerUserId === userId).slice(0, 20),
    [allJobs, userId],
  );

  const onSubmit = async () => {
    if (!keyConfigured) {
      Alert.alert(t('create.needKeyTitle'), t('create.needKeyMsg'), [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('create.toSettings'), onPress: () => router.push('/settings' as any) },
      ]);
      return;
    }
    if (!prompt.trim()) {
      Alert.alert(t('create.promptEmpty'), t('create.promptEmptyMsg'));
      return;
    }
    if (credits < COST_GENERATION) {
      if (hasSupabase) {
        showDialog({
          title: t('create.creditsLow'),
          message: t('create.creditsExhausted'),
          primaryLabel: t('create.claimCredits'),
          secondaryLabel: t('common.ok'),
          icon: 'sparkles',
          onPrimary: async () => {
            try {
              await grantCreditsRemote(5);
              await syncRemote(userId);
              showToast({ message: t('create.claimed') });
            } catch (e: any) {
              showToast({ message: `${e?.message ?? '...'}`, durationMs: 4000 });
            }
          },
        });
      } else {
        Alert.alert(t('create.creditsLow'), t('create.creditsLowAlt'));
      }
      return;
    }
    if (!charge(userId)) {
      Alert.alert(t('create.creditsLow'), t('settings.getCreditsMsg'));
      return;
    }
    try {
      await submitTextToVideo({ prompt: prompt.trim(), aspect });
      setPrompt('');
      showToast({ message: t('create.submitted') });
    } catch (e: any) {
      refund(userId);
      Alert.alert(t('create.submitFailed'), e?.message ?? String(e));
    }
  };

  const activeJobs = myJobs.filter((j) => j.status === 'queued' || j.status === 'running');
  const recentJobs = myJobs.filter((j) => j.status !== 'queued' && j.status !== 'running').slice(0, 5);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: contentBottomPad }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.headerRow}>
            <View style={styles.heroIcon}>
              <Wand2 color={colors.primary} size={24} />
            </View>
            <View style={styles.creditsChip}>
              <CreditsDisplay />
            </View>
          </View>
          <Text style={styles.title}>{t('create.title')}</Text>
          <Text style={styles.sub}>{t('create.sub', { n: COST_GENERATION })}</Text>

          <TextInput
            style={styles.input}
            value={prompt}
            onChangeText={setPrompt}
            placeholder={t('create.inputPlaceholder')}
            placeholderTextColor={colors.textDim}
            multiline
            maxLength={500}
          />
          <Text style={styles.counter}>{prompt.length} / 500</Text>

          <Text style={styles.sectionLabel}>{t('create.inspiration')}</Text>
          <View style={styles.suggestions}>
            {PROMPT_SUGGESTION_KEYS.map((k) => {
              const s = t(k);
              return (
                <Pressable key={k} style={styles.suggestion} onPress={() => setPrompt(s)}>
                  <Sparkles color={colors.accent} size={13} />
                  <Text style={styles.suggestionText} numberOfLines={2}>{s}</Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.sectionLabel}>{t('ai.model')}</Text>
          <View style={styles.aspectRow}>
            {providerModels.map((m) => (
              <Pressable
                key={m.id}
                style={[styles.aspectChip, selectedModel === m.id && styles.aspectChipActive]}
                onPress={() => setModel(aiProvider, m.id)}
              >
                <Text style={[styles.aspectText, selectedModel === m.id && styles.aspectTextActive]}>{m.label}</Text>
                {m.note && (
                  <Text style={[styles.aspectHint, selectedModel === m.id && styles.aspectHintActive]} numberOfLines={1}>
                    {m.note}
                  </Text>
                )}
              </Pressable>
            ))}
          </View>
          {!keyConfigured && (
            <Pressable style={styles.keyWarn} onPress={() => router.push('/settings' as any)}>
              <Text style={styles.keyWarnText}>{t('create.needKey')}</Text>
            </Pressable>
          )}

          <Text style={styles.sectionLabel}>{t('create.aspect')}</Text>
          <View style={styles.aspectRow}>
            {(['9:16', '16:9'] as const).map((a) => (
              <Pressable key={a} style={[styles.aspectChip, aspect === a && styles.aspectChipActive]} onPress={() => setAspect(a)}>
                <Text style={[styles.aspectText, aspect === a && styles.aspectTextActive]}>{a}</Text>
                <Text style={[styles.aspectHint, aspect === a && styles.aspectHintActive]}>
                  {a === '9:16' ? t('create.aspectPortrait') : t('create.aspectLandscape')}
                </Text>
              </Pressable>
            ))}
          </View>

          <Pressable
            style={[styles.button, (credits < COST_GENERATION || !keyConfigured) && styles.buttonDisabled]}
            disabled={credits < COST_GENERATION || !keyConfigured}
            onPress={onSubmit}
          >
            <Sparkles color="#fff" size={18} />
            <Text style={styles.buttonText}>{t('create.submit', { n: COST_GENERATION })}</Text>
          </Pressable>

          <Text style={styles.note}>{t('create.submittedNote')}</Text>

          {/* 进行中的任务 */}
          {activeJobs.length > 0 && (
            <View style={styles.jobsBlock}>
              <Text style={styles.sectionLabel}>{t('create.generating', { n: activeJobs.length })}</Text>
              {activeJobs.map((j) => <JobCard key={j.id} job={j} />)}
            </View>
          )}

          {/* 已完成 / 失败的最近任务 */}
          {recentJobs.length > 0 && (
            <View style={styles.jobsBlock}>
              <Text style={styles.sectionLabel}>{t('create.recentJobs')}</Text>
              {recentJobs.map((j) => (
                <JobCard
                  key={j.id}
                  job={j}
                  onPress={j.finishedVideoId ? () => router.push(`/video/${j.finishedVideoId}`) : undefined}
                />
              ))}
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function JobCard({ job, onPress }: { job: AiJobRecord; onPress?: () => void }) {
  const t = useT();
  const cancel = useJobs((s) => s.cancel);
  const icon = job.status === 'succeeded' ? <CheckCircle2 color={colors.success} size={18} />
    : job.status === 'failed' ? <XCircle color={colors.danger} size={18} />
    : job.status === 'cancelled' ? <XCircle color={colors.textMuted} size={18} />
    : <ActivityIndicator color={colors.accent} size="small" />;

  const elapsed = secsSince(job.createdAt);

  return (
    <Pressable style={styles.jobCard} onPress={onPress} disabled={!onPress}>
      <View style={styles.jobIcon}>{icon}</View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.jobPrompt} numberOfLines={2}>{job.promptSummary}</Text>
        <View style={styles.jobMetaRow}>
          <Text style={styles.jobStatus}>{job.statusMsg}</Text>
          <Text style={styles.jobDot}>·</Text>
          <Clock color={colors.textDim} size={11} />
          <Text style={styles.jobElapsed}>{elapsed}s</Text>
        </View>
      </View>
      {(job.status === 'queued' || job.status === 'running') && (
        <Pressable hitSlop={6} onPress={() => cancel(job.id)} style={styles.cancelBtn}>
          <Text style={styles.cancelTxt}>{t('common.cancel')}</Text>
        </Pressable>
      )}
      {job.status === 'succeeded' && onPress && (
        <ChevronRight color={colors.textMuted} size={18} />
      )}
    </Pressable>
  );
}

function secsSince(ts: number): number {
  return Math.max(0, Math.round((Date.now() - ts) / 1000));
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, gap: spacing.md },

  // 登录 wall
  wallContent: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.xl, gap: spacing.md },

  heroIcon: {
    width: 56, height: 56, borderRadius: 28, backgroundColor: colors.primarySoft,
    alignItems: 'center', justifyContent: 'center',
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  creditsChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: spacing.md, paddingVertical: 6,
    backgroundColor: colors.surface, borderRadius: radius.pill,
    borderWidth: 1, borderColor: colors.border,
  },

  title: { ...typography.h1, color: colors.text },
  sub: { ...typography.body, color: colors.textMuted },

  input: {
    minHeight: 130,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    color: colors.text,
    textAlignVertical: 'top',
    ...typography.body,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: spacing.sm,
  },
  counter: { ...typography.tiny, color: colors.textDim, textAlign: 'right' },

  sectionLabel: { ...typography.captionStrong, color: colors.textMuted, marginTop: spacing.md, textTransform: 'uppercase', letterSpacing: 0.5 },
  suggestions: { gap: spacing.sm },
  suggestion: {
    flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm,
    backgroundColor: colors.surface, padding: spacing.md, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border,
  },
  suggestionText: { ...typography.caption, color: colors.textSecondary, flex: 1, lineHeight: 18 },

  aspectRow: { flexDirection: 'row', gap: spacing.sm },
  aspectChip: {
    flex: 1, paddingVertical: spacing.md, alignItems: 'center', borderRadius: radius.md,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
  },
  aspectChipActive: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  aspectText: { ...typography.bodyStrong, color: colors.textMuted },
  aspectTextActive: { color: colors.primary },
  aspectHint: { ...typography.tiny, color: colors.textDim, marginTop: 2 },
  aspectHintActive: { color: colors.primaryDim },

  keyWarn: {
    marginTop: spacing.sm, padding: spacing.sm,
    backgroundColor: colors.primarySoft, borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.primary,
  },
  keyWarnText: { ...typography.tiny, color: colors.text, lineHeight: 16 },

  button: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    backgroundColor: colors.primary, paddingVertical: spacing.md + 2, borderRadius: radius.lg,
    marginTop: spacing.md,
  },
  buttonDisabled: { opacity: 0.45 },
  buttonText: { ...typography.button, color: '#fff' },

  note: { ...typography.tiny, color: colors.textDim, marginTop: spacing.sm, lineHeight: 16 },
  noteAccent: { color: colors.accent, fontWeight: '600' },

  jobsBlock: { gap: spacing.sm, marginTop: spacing.lg },
  jobCard: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    padding: spacing.md, backgroundColor: colors.surface,
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
  },
  jobIcon: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  jobPrompt: { ...typography.caption, color: colors.text },
  jobMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  jobStatus: { ...typography.tiny, color: colors.textMuted },
  jobDot: { color: colors.textDim, ...typography.tiny },
  jobElapsed: { ...typography.tiny, color: colors.textDim },
  cancelBtn: { paddingHorizontal: spacing.sm, paddingVertical: 4 },
  cancelTxt: { ...typography.tiny, color: colors.textMuted, fontWeight: '600' },
});
