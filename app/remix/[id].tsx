import { useState, useEffect } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, Image, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { X, GitBranch, RotateCw, Coins } from 'lucide-react-native';
import { getVideo } from '@/api/videos';
import { colors, radius, spacing, typography } from '@/theme';
import { useAuth } from '@/store/auth';
import { useCredits, COST_GENERATION } from '@/store/credits';
import { submitContinuation, submitRemix } from '@/store/jobs';
import { hasSupabase } from '@/api/client';
import { showDialog } from '@/components/dialog/ConfirmDialog';
import { showToast } from '@/components/toast/Toast';
import { grantCreditsRemote } from '@/api/supabase/creditsRepo';

type Mode = 'continuation' | 'prompt_remix';

export default function RemixScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user, isAnonymous, requireAuth } = useAuth();
  const [mode, setMode] = useState<Mode>('continuation');
  const [prompt, setPrompt] = useState('');
  // 同 Create 页:从 byUser 读纯数据,避免 selector 内 setState 触发循环
  const creditsMap = useCredits((s) => s.byUser);
  const ensureCreditsInit = useCredits((s) => s.ensureInit);
  const syncRemote = useCredits((s) => s.syncRemote);
  const charge = useCredits((s) => s.charge);
  const refund = useCredits((s) => s.refund);
  const credits = user ? (creditsMap[user.id] ?? 5) : 0;
  useEffect(() => {
    if (user) {
      if (hasSupabase) {
        void syncRemote(user.id);
      } else {
        ensureCreditsInit(user.id);
      }
    }
  }, [user, ensureCreditsInit, syncRemote]);

  const { data: source } = useQuery({
    queryKey: ['video', id],
    queryFn: () => getVideo(id!),
    enabled: !!id,
  });

  // 未登录直接拦
  if (isAnonymous || !user) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.wall}>
          <Text style={styles.title}>登录后才能在他人作品上创作</Text>
          <Text style={styles.sub}>续写 / Remix 是 AI Shorts 的核心玩法,登录后获得 5 个免费额度。</Text>
          <Pressable style={styles.button} onPress={() => { router.dismiss(); requireAuth(router); }}>
            <Text style={styles.buttonText}>去登录</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const onSubmit = async () => {
    if (!prompt.trim() || !source) return;
    if (credits < COST_GENERATION) {
      if (hasSupabase) {
        showDialog({
          title: '额度不足',
          message: '你的生成额度已耗尽。可以领取 5 个体验额度继续创作。',
          primaryLabel: '领取体验额度',
          secondaryLabel: '知道了',
          icon: 'sparkles',
          onPrimary: async () => {
            try {
              await grantCreditsRemote(5);
              await syncRemote(user!.id);
              showToast({ message: '已领取 5 额度,快去创作吧!' });
            } catch (e: any) {
              showToast({ message: `领取失败:${e?.message ?? '请稍后重试'}`, durationMs: 4000 });
            }
          },
        });
      } else {
        Alert.alert('额度不足', '邀请好友可获取更多额度(敬请期待)');
      }
      return;
    }
    if (!charge(user.id)) {
      Alert.alert('额度不足');
      return;
    }
    try {
      if (mode === 'continuation') {
        await submitContinuation({ parentVideo: source, prompt: prompt.trim() });
      } else {
        await submitRemix({ parentVideo: source, prompt: prompt.trim() });
      }
      // 关闭 modal 后跳回创作 tab(展示"我的任务")。dismissTo 一步到位,避免栈累积。
      router.dismissTo('/(tabs)/create');
    } catch (e: any) {
      refund(user.id);
      Alert.alert('提交失败', e?.message ?? String(e));
    }
  };

  if (!source) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <Text style={styles.loading}>加载源视频...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Pressable hitSlop={12} onPress={() => router.back()}>
          <X color={colors.text} size={24} />
        </Pressable>
        <Text style={styles.headerTitle}>基于这条视频创作</Text>
        <View style={styles.creditsChip}>
          <Coins color={colors.warning} size={12} />
          <Text style={styles.creditsText}>{credits}</Text>
        </View>
      </View>

      <View style={styles.sourceCard}>
        {source.thumbnail_url ? (
          <Image source={{ uri: source.thumbnail_url }} style={styles.sourceThumb} />
        ) : (
          <View style={[styles.sourceThumb, { backgroundColor: colors.surfaceAlt }]} />
        )}
        <View style={{ flex: 1 }}>
          <Text style={styles.sourcePrompt} numberOfLines={3}>{source.prompt}</Text>
          <Text style={styles.sourceAuthor}>@{source.author?.username ?? 'unknown'}</Text>
        </View>
      </View>

      <View style={styles.modeRow}>
        <ModeButton
          active={mode === 'continuation'}
          icon={<GitBranch color={mode === 'continuation' ? colors.primary : colors.textMuted} size={18} />}
          label="尾帧续写"
          desc="以原视频最后一帧为起点"
          onPress={() => setMode('continuation')}
        />
        <ModeButton
          active={mode === 'prompt_remix'}
          icon={<RotateCw color={mode === 'prompt_remix' ? colors.primary : colors.textMuted} size={18} />}
          label="Prompt Remix"
          desc="改写 prompt 重新生成"
          onPress={() => setMode('prompt_remix')}
        />
      </View>

      <TextInput
        style={styles.input}
        value={prompt}
        onChangeText={setPrompt}
        placeholder={mode === 'continuation' ? '接下来发生了什么?例:猫漂离土星,加速进入虫洞' : '改写主题、风格、角色,例:把橘猫换成熊猫,赛博朋克风'}
        placeholderTextColor={colors.textDim}
        multiline
        maxLength={500}
      />

      <Pressable
        style={[styles.button, (credits < COST_GENERATION) && styles.buttonDisabled]}
        disabled={credits < COST_GENERATION}
        onPress={onSubmit}
      >
        <Text style={styles.buttonText}>提交生成 (消耗 {COST_GENERATION})</Text>
      </Pressable>

      <Text style={styles.note}>提交后可关闭此页,生成在后台进行,可在"创作 → 我的任务"查看进度。</Text>
    </SafeAreaView>
  );
}

function ModeButton({
  active, icon, label, desc, onPress,
}: { active: boolean; icon: React.ReactNode; label: string; desc: string; onPress: () => void }) {
  return (
    <Pressable style={[styles.modeBtn, active && styles.modeBtnActive]} onPress={onPress}>
      <View style={styles.modeHead}>
        {icon}
        <Text style={[styles.modeLabel, active && styles.modeLabelActive]}>{label}</Text>
      </View>
      <Text style={styles.modeDesc}>{desc}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg, padding: spacing.lg, gap: spacing.lg },
  loading: { color: colors.text, padding: spacing.lg },
  wall: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: spacing.md, padding: spacing.xl },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerTitle: { ...typography.h3, color: colors.text },
  creditsChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: colors.surface, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border },
  creditsText: { ...typography.captionStrong, color: colors.text },
  title: { ...typography.h2, color: colors.text, textAlign: 'center' },
  sub: { ...typography.body, color: colors.textMuted, textAlign: 'center' },

  sourceCard: { flexDirection: 'row', gap: spacing.md, backgroundColor: colors.surface, padding: spacing.md, borderRadius: radius.md },
  sourceThumb: { width: 64, height: 96, borderRadius: radius.sm },
  sourcePrompt: { ...typography.caption, color: colors.text, lineHeight: 18 },
  sourceAuthor: { ...typography.tiny, color: colors.textMuted, marginTop: 4 },
  modeRow: { flexDirection: 'row', gap: spacing.sm },
  modeBtn: { flex: 1, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, gap: 4 },
  modeBtnActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  modeHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  modeLabel: { ...typography.bodyStrong, color: colors.textMuted },
  modeLabelActive: { color: colors.primary },
  modeDesc: { ...typography.tiny, color: colors.textDim },
  input: {
    minHeight: 120, backgroundColor: colors.surface, borderRadius: radius.md,
    padding: spacing.md, color: colors.text, textAlignVertical: 'top', ...typography.body,
    borderWidth: 1, borderColor: colors.border,
  },
  button: { backgroundColor: colors.primary, paddingVertical: spacing.md + 2, borderRadius: radius.lg, alignItems: 'center' },
  buttonDisabled: { opacity: 0.45 },
  buttonText: { ...typography.button, color: '#fff' },
  note: { ...typography.tiny, color: colors.textDim, textAlign: 'center' },
});
