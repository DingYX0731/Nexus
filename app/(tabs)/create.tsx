import { useState, useMemo, useEffect } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, Alert, ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Sparkles, Wand2, Lock, Coins, Clock, CheckCircle2, XCircle, ChevronRight } from 'lucide-react-native';
import { colors, radius, spacing, typography } from '@/theme';
import { defaultProvider } from '@/ai/VideoGenProvider';
import { useTabBarSpace } from '@/hooks/useTabBarSpace';
import { useAuth } from '@/store/auth';
import { useCredits, COST_GENERATION } from '@/store/credits';
import { useJobs, submitTextToVideo, type AiJobRecord } from '@/store/jobs';
import { showToast } from '@/components/toast/Toast';

const PROMPT_SUGGESTIONS = [
  '一只穿宇航服的橘猫漂浮在土星环上,慢镜头,电影感',
  '都市夜景里的霓虹下雨,慢镜头水滴坠落',
  '少女在樱花树下转圈,花瓣随风飘散',
  '机器人在废墟里点燃篝火,赛博朋克风',
];

const PROVIDER_LABEL: Record<string, string> = {
  mock: 'Mock(本地示例)',
  doubao: '豆包 Seedance',
  kling: '可灵 Kling',
};

export default function CreateScreen() {
  const router = useRouter();
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
          <Text style={styles.title}>创作需要先登录</Text>
          <Text style={styles.sub}>
            登录后可获得 5 个免费额度,可生成自己的 AI 短视频,在他人作品上做续写、Remix 或剪辑。
          </Text>
          <Pressable style={styles.button} onPress={() => router.push('/auth/login')}>
            <Text style={styles.buttonText}>登录 / 注册</Text>
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
  const [prompt, setPrompt] = useState('');
  const [aspect, setAspect] = useState<'9:16' | '16:9'>('9:16');

  // 关键:zustand selector 必须返回稳定的引用,所以选基础数据,再用 useMemo 派生。
  // 不要直接 useCredits((s) => s.get(userId))(get() 内部会 setState 触发循环),
  // 也不要 useJobs((s) => s.visibleFor(userId))(每次返回新数组 → getSnapshot 不稳定)。
  const creditsMap = useCredits((s) => s.byUser);
  const ensureCreditsInit = useCredits((s) => s.ensureInit);
  const charge = useCredits((s) => s.charge);
  const refund = useCredits((s) => s.refund);

  const allJobs = useJobs((s) => s.jobs);

  useEffect(() => { ensureCreditsInit(userId); }, [userId, ensureCreditsInit]);

  const credits = creditsMap[userId] ?? 5; // ensureInit 之前先用默认值,避免 0 闪一下
  const myJobs = useMemo(
    () => allJobs.filter((j) => j.ownerUserId === userId).slice(0, 20),
    [allJobs, userId],
  );

  const onSubmit = async () => {
    if (!prompt.trim()) {
      Alert.alert('请输入 prompt', '描述一下你想生成什么样的画面。');
      return;
    }
    if (credits < COST_GENERATION) {
      Alert.alert('额度不足', '邀请好友或完成任务可获取更多额度(M3 上线)。');
      return;
    }
    if (!charge(userId)) {
      Alert.alert('额度不足', '邀请好友或完成任务可获取更多额度(敬请期待)');
      return;
    }
    try {
      await submitTextToVideo({ prompt: prompt.trim(), aspect });
      setPrompt('');
      showToast({ message: '已提交,可在下方查看进度' });
    } catch (e: any) {
      refund(userId);
      Alert.alert('提交失败', e?.message ?? String(e));
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
              <Coins color={colors.warning} size={14} />
              <Text style={styles.creditsText}>{credits} 额度</Text>
            </View>
          </View>
          <Text style={styles.title}>用 AI 生成短视频</Text>
          <Text style={styles.sub}>描述画面、人物、动作和情绪。每条视频消耗 {COST_GENERATION} 个额度。</Text>

          <TextInput
            style={styles.input}
            value={prompt}
            onChangeText={setPrompt}
            placeholder="例:一只穿宇航服的橘猫漂浮在土星环上,慢镜头,电影感"
            placeholderTextColor={colors.textDim}
            multiline
            maxLength={500}
          />
          <Text style={styles.counter}>{prompt.length} / 500</Text>

          <Text style={styles.sectionLabel}>试试这些灵感</Text>
          <View style={styles.suggestions}>
            {PROMPT_SUGGESTIONS.map((s) => (
              <Pressable key={s} style={styles.suggestion} onPress={() => setPrompt(s)}>
                <Sparkles color={colors.accent} size={13} />
                <Text style={styles.suggestionText} numberOfLines={2}>{s}</Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.sectionLabel}>画幅</Text>
          <View style={styles.aspectRow}>
            {(['9:16', '16:9'] as const).map((a) => (
              <Pressable key={a} style={[styles.aspectChip, aspect === a && styles.aspectChipActive]} onPress={() => setAspect(a)}>
                <Text style={[styles.aspectText, aspect === a && styles.aspectTextActive]}>{a}</Text>
                <Text style={[styles.aspectHint, aspect === a && styles.aspectHintActive]}>
                  {a === '9:16' ? '竖屏' : '横屏'}
                </Text>
              </Pressable>
            ))}
          </View>

          <Pressable
            style={[styles.button, (credits < COST_GENERATION) && styles.buttonDisabled]}
            disabled={credits < COST_GENERATION}
            onPress={onSubmit}
          >
            <Sparkles color="#fff" size={18} />
            <Text style={styles.buttonText}>
              提交生成 (消耗 {COST_GENERATION})
            </Text>
          </Pressable>

          <Text style={styles.note}>
            提交后可继续刷视频,生成在后台进行,完成时会通知你。
          </Text>

          {/* 进行中的任务 */}
          {activeJobs.length > 0 && (
            <View style={styles.jobsBlock}>
              <Text style={styles.sectionLabel}>正在生成 · {activeJobs.length}</Text>
              {activeJobs.map((j) => <JobCard key={j.id} job={j} />)}
            </View>
          )}

          {/* 已完成 / 失败的最近任务 */}
          {recentJobs.length > 0 && (
            <View style={styles.jobsBlock}>
              <Text style={styles.sectionLabel}>最近任务</Text>
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
          <Text style={styles.cancelTxt}>取消</Text>
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
  creditsText: { ...typography.captionStrong, color: colors.text },

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
