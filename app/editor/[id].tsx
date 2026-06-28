import { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { X, Type, Palette, Music, Scissors } from 'lucide-react-native';
import { getVideo, publishEdit } from '@/api/videos';
import { VideoPlayer } from '@/components/player/VideoPlayer';
import type { EditMetadata, FilterId } from '@/api/types';
import { colors, radius, spacing, typography } from '@/theme';
import { useAuth } from '@/store/auth';

const FILTERS: { id: FilterId; label: string }[] = [
  { id: 'none', label: '原片' },
  { id: 'vintage', label: '复古' },
  { id: 'mono', label: '黑白' },
  { id: 'warm', label: '暖色' },
  { id: 'cool', label: '冷色' },
];

export default function EditorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user, isAnonymous, requireAuth } = useAuth();
  const qc = useQueryClient();
  const { data: source } = useQuery({
    queryKey: ['video', id],
    queryFn: () => getVideo(id!),
    enabled: !!id,
  });

  const [caption, setCaption] = useState('');
  const [filter, setFilter] = useState<FilterId>('none');
  const [busy, setBusy] = useState(false);

  const edit: EditMetadata = {
    captions: caption.trim()
      ? [{ text: caption.trim(), startMs: 0, endMs: 99_999, style: { x: 0.5, y: 0.85, color: '#fff', size: 22 } }]
      : undefined,
    filter,
  };

  if (isAnonymous || !user) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.wall}>
          <Text style={styles.wallTitle}>剪辑发布需要先登录</Text>
          <Text style={styles.wallSub}>登录后可对他人作品做非破坏性剪辑(加字幕 / 滤镜)并发布。</Text>
          <Pressable style={styles.button} onPress={() => { router.dismiss(); requireAuth(router); }}>
            <Text style={styles.buttonText}>去登录</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const onPublish = async () => {
    if (!source) return;
    setBusy(true);
    try {
      const video = await publishEdit({ parentId: source.id, editMetadata: edit });
      qc.invalidateQueries({ queryKey: ['feed'] });
      qc.invalidateQueries({ queryKey: ['myVideos'] });
      router.dismissTo(`/video/${video.id}`);
    } catch (e: any) {
      Alert.alert('发布失败', e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  };

  if (!source) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <Text style={{ color: colors.text, padding: spacing.lg }}>加载源视频...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}>
          <X color={colors.text} size={24} />
        </Pressable>
        <Text style={styles.title}>剪辑</Text>
        <Pressable disabled={busy} onPress={onPublish}>
          <Text style={[styles.publish, busy && { opacity: 0.5 }]}>{busy ? '发布中...' : '发布'}</Text>
        </Pressable>
      </View>

      <View style={styles.preview}>
        <VideoPlayer
          videoUrl={source.video_url}
          editMetadata={edit}
          isActive
          looping
        />
      </View>

      <ScrollView style={styles.controls} contentContainerStyle={{ gap: spacing.lg, padding: spacing.lg }}>
        <Section icon={<Type color={colors.text} size={18} />} title="字幕">
          <TextInput
            style={styles.input}
            value={caption}
            onChangeText={setCaption}
            placeholder="加一句话(显示在画面底部)"
            placeholderTextColor={colors.textDim}
            maxLength={80}
          />
        </Section>

        <Section icon={<Palette color={colors.text} size={18} />} title="滤镜">
          <View style={styles.chipRow}>
            {FILTERS.map((f) => (
              <Pressable key={f.id} style={[styles.chip, filter === f.id && styles.chipActive]} onPress={() => setFilter(f.id)}>
                <Text style={[styles.chipText, filter === f.id && styles.chipTextActive]}>{f.label}</Text>
              </Pressable>
            ))}
          </View>
        </Section>

        <Section icon={<Scissors color={colors.text} size={18} />} title="裁剪">
          <Text style={styles.todo}>裁剪功能正在路上,当前发布会保留完整时长。</Text>
        </Section>

        <Section icon={<Music color={colors.text} size={18} />} title="背景音乐">
          <Text style={styles.todo}>内置无版权音乐库正在准备中。</Text>
        </Section>
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: spacing.sm }}>
      <View style={styles.sectionHead}>
        {icon}
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  wall: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: spacing.md, padding: spacing.xl },
  wallTitle: { ...typography.h2, color: colors.text, textAlign: 'center' },
  wallSub: { ...typography.body, color: colors.textMuted, textAlign: 'center' },
  button: { backgroundColor: colors.primary, paddingHorizontal: spacing.xxl, paddingVertical: spacing.md, borderRadius: radius.pill },
  buttonText: { ...typography.button, color: '#fff' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  title: { color: colors.text, fontSize: 17, fontWeight: '600' },
  publish: { color: colors.primary, fontSize: 16, fontWeight: '700' },
  preview: { aspectRatio: 9 / 16, backgroundColor: '#000', marginHorizontal: spacing.lg, borderRadius: radius.md, overflow: 'hidden' },
  controls: { flex: 1 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  sectionTitle: { color: colors.text, fontSize: 15, fontWeight: '600' },
  input: {
    backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md,
    color: colors.text, borderWidth: 1, borderColor: colors.border, fontSize: 15,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, backgroundColor: colors.surface, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border },
  chipActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  chipText: { color: colors.textMuted, fontWeight: '600' },
  chipTextActive: { color: colors.primary },
  todo: { color: colors.textDim, fontSize: 12, lineHeight: 18 },
});
