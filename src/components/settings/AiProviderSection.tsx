// 设置页「创作」区块：选 AI 服务商 + 选模型 + 填/清除自带 API Key。
//
// 安全：Key 只写入 SecureStore（见 useAiSettings），此组件仅显示「是否已配置」状态，
// 绝不回显 key 明文；输入框用 secureTextEntry，保存后立即清空本地输入 state。
import { useState, useEffect } from 'react';
import { View, Text, Pressable, TextInput, StyleSheet } from 'react-native';
import { Sparkles, KeyRound, Check, Trash2, ShieldCheck } from 'lucide-react-native';
import { colors, radius, spacing, typography } from '@/theme';
import { useAiSettings, PROVIDERS, isValidApiKeyFormat, type ProviderId } from '@/store/aiSettings';
import { showToast } from '@/components/toast/Toast';
import { useT } from '@/i18n';

export function AiProviderSection() {
  const t = useT();
  const provider = useAiSettings((s) => s.provider);
  const modelByProvider = useAiSettings((s) => s.modelByProvider);
  const hasKey = useAiSettings((s) => s.hasKey);
  const setProvider = useAiSettings((s) => s.setProvider);
  const setModel = useAiSettings((s) => s.setModel);
  const saveKey = useAiSettings((s) => s.saveKey);
  const clearKey = useAiSettings((s) => s.clearKey);

  const refreshHasKey = useAiSettings((s) => s.refreshHasKey);
  const [keyInput, setKeyInput] = useState('');
  const [editing, setEditing] = useState(false);

  // 启动/进入时以 SecureStore 为真源校准「已配置」标记
  useEffect(() => { void refreshHasKey(); }, [refreshHasKey]);

  const current = PROVIDERS.find((p) => p.id === provider)!;
  const selectedModel = modelByProvider[provider] ?? current.models[0]?.id;
  const keyConfigured = !!hasKey[provider];

  const onSaveKey = async () => {
    const ok = await saveKey(provider, keyInput);
    if (!ok) {
      showToast({ message: t('ai.keyInvalid'), durationMs: 3500 });
      return;
    }
    setKeyInput('');
    setEditing(false);
    showToast({ message: t('ai.keySaved') });
  };

  const onClearKey = async () => {
    await clearKey(provider);
    setKeyInput('');
    setEditing(false);
    showToast({ message: t('ai.keyCleared') });
  };

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{t('settings.section.create')}</Text>
      <View style={styles.body}>
        {/* 服务商选择 */}
        <View style={styles.block}>
          <View style={styles.blockHead}>
            <Sparkles color={colors.accent} size={18} />
            <Text style={styles.blockLabel}>{t('ai.provider')}</Text>
          </View>
          <View style={styles.chips}>
            {PROVIDERS.map((p) => (
              <Chip
                key={p.id}
                label={p.label}
                active={p.id === provider}
                onPress={() => setProvider(p.id as ProviderId)}
              />
            ))}
          </View>
        </View>

        {/* 模型选择 */}
        <View style={styles.block}>
          <Text style={styles.blockSub}>{t('ai.model')}</Text>
          <View style={styles.chips}>
            {current.models.map((m) => (
              <Chip
                key={m.id}
                label={m.label}
                active={m.id === selectedModel}
                onPress={() => setModel(provider, m.id)}
              />
            ))}
          </View>
          {current.models.find((m) => m.id === selectedModel)?.note && (
            <Text style={styles.note}>{current.models.find((m) => m.id === selectedModel)!.note}</Text>
          )}
        </View>

        {/* API Key */}
        <View style={styles.block}>
          <View style={styles.blockHead}>
            <KeyRound color={colors.text} size={18} />
            <Text style={styles.blockLabel}>{t('ai.apiKey')}</Text>
            {keyConfigured && !editing && (
              <View style={styles.okBadge}>
                <Check color={colors.success} size={13} />
                <Text style={styles.okText}>{t('ai.configured')}</Text>
              </View>
            )}
          </View>

          {keyConfigured && !editing ? (
            <View style={styles.keyRow}>
              <Text style={styles.masked}>••••••••••••••••</Text>
              <View style={styles.keyBtns}>
                <Pressable style={styles.smallBtn} onPress={() => setEditing(true)}>
                  <Text style={styles.smallBtnText}>{t('ai.replace')}</Text>
                </Pressable>
                <Pressable style={[styles.smallBtn, styles.dangerBtn]} onPress={onClearKey}>
                  <Trash2 color={colors.danger} size={13} />
                  <Text style={[styles.smallBtnText, { color: colors.danger }]}>{t('ai.clear')}</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <View style={styles.keyEdit}>
              <TextInput
                style={styles.input}
                value={keyInput}
                onChangeText={setKeyInput}
                placeholder={current.keyHint}
                placeholderTextColor={colors.textDim}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="off"
                textContentType="password"
              />
              <View style={styles.keyBtns}>
                <Pressable
                  style={[styles.smallBtn, styles.primaryBtn, !isValidApiKeyFormat(keyInput.trim()) && styles.disabledBtn]}
                  disabled={!isValidApiKeyFormat(keyInput.trim())}
                  onPress={onSaveKey}
                >
                  <Text style={[styles.smallBtnText, { color: '#fff' }]}>{t('common.save')}</Text>
                </Pressable>
                {editing && (
                  <Pressable style={styles.smallBtn} onPress={() => { setEditing(false); setKeyInput(''); }}>
                    <Text style={styles.smallBtnText}>{t('common.cancel')}</Text>
                  </Pressable>
                )}
              </View>
            </View>
          )}

          <View style={styles.securityNote}>
            <ShieldCheck color={colors.textMuted} size={13} />
            <Text style={styles.securityText}>{t('ai.security')}</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable style={[styles.chip, active && styles.chipActive]} onPress={onPress}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
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
    borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: spacing.lg,
  },
  block: { gap: spacing.sm },
  blockHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  blockLabel: { ...typography.body, color: colors.text },
  blockSub: { ...typography.caption, color: colors.textMuted },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    paddingHorizontal: spacing.md, paddingVertical: 8, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg,
  },
  chipActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  chipText: { ...typography.caption, color: colors.textSecondary },
  chipTextActive: { color: colors.text, fontWeight: '700' },
  note: { ...typography.tiny, color: colors.textDim },

  okBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, marginLeft: 'auto' },
  okText: { ...typography.tiny, color: colors.success, fontWeight: '600' },

  keyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  masked: { ...typography.body, color: colors.textMuted, letterSpacing: 2 },
  keyEdit: { gap: spacing.sm },
  input: {
    ...typography.body, color: colors.text,
    backgroundColor: colors.bg, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: spacing.md, paddingVertical: 10,
  },
  keyBtns: { flexDirection: 'row', gap: spacing.sm },
  smallBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: spacing.md, paddingVertical: 8, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border,
  },
  primaryBtn: { backgroundColor: colors.primary, borderColor: colors.primary },
  dangerBtn: { borderColor: colors.danger },
  disabledBtn: { opacity: 0.4 },
  smallBtnText: { ...typography.caption, color: colors.text, fontWeight: '600' },

  securityNote: { flexDirection: 'row', gap: 6, alignItems: 'flex-start', marginTop: 2 },
  securityText: { ...typography.tiny, color: colors.textMuted, flex: 1, lineHeight: 16 },
});
