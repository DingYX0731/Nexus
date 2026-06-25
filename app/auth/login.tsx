import { useState, useMemo } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { X, Sparkles, AlertCircle } from 'lucide-react-native';
import { colors, radius, spacing, typography } from '@/theme';
import { useAuth } from '@/store/auth';

const USERNAME_RE = /^[a-zA-Z0-9_一-龥]+$/;

interface Validation {
  ok: boolean;
  msg?: string;
}

function validateUsername(raw: string): Validation {
  const name = raw.trim();
  if (name.length === 0) return { ok: false, msg: '请输入用户名' };
  if (name.length < 2) return { ok: false, msg: '用户名至少 2 个字符' };
  if (name.length > 20) return { ok: false, msg: '用户名最多 20 个字符' };
  if (!USERNAME_RE.test(name)) {
    return { ok: false, msg: '只允许字母、数字、下划线和中文' };
  }
  return { ok: true };
}

export default function LoginScreen() {
  const router = useRouter();
  const { signInMock } = useAuth();
  const [username, setUsername] = useState('');
  const [touched, setTouched] = useState(false);

  const validation = useMemo(() => validateUsername(username), [username]);
  // 用户没碰过输入框时不显示错误(避免一打开就标红)
  const showError = touched && !validation.ok && username.length > 0;

  const onSubmit = () => {
    setTouched(true);
    if (!validation.ok) return;
    signInMock(username.trim());
    router.back();
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Pressable hitSlop={12} onPress={() => router.back()}>
          <X color={colors.text} size={24} />
        </Pressable>
      </View>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.body}>
          <View style={styles.heroIcon}>
            <Sparkles color={colors.primary} size={28} />
          </View>
          <Text style={styles.title}>用一个用户名开始</Text>
          <Text style={styles.sub}>
            登录后获得 5 个免费额度,可生成 AI 视频、点赞、续写。{'\n'}
            用一个用户名快速开始,无需密码。
          </Text>
          <View style={styles.fieldGroup}>
            <View style={[styles.inputWrap, showError && styles.inputWrapError]}>
              <Text style={styles.at}>@</Text>
              <TextInput
                style={styles.input}
                value={username}
                onChangeText={(t) => { setUsername(t); if (!touched) setTouched(true); }}
                onBlur={() => setTouched(true)}
                placeholder="2-20 个字符,字母/数字/下划线/中文"
                placeholderTextColor={colors.textDim}
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={20}
                onSubmitEditing={onSubmit}
                returnKeyType="done"
              />
              <Text style={styles.counter}>{username.length}/20</Text>
            </View>
            {showError ? (
              <View style={styles.errorRow}>
                <AlertCircle color={colors.danger} size={13} />
                <Text style={styles.errorText}>{validation.msg}</Text>
              </View>
            ) : (
              <Text style={styles.hint}>例:demo_user、小红、kira_2024</Text>
            )}
          </View>
          <Pressable
            style={[styles.button, !validation.ok && styles.buttonDisabled]}
            disabled={!validation.ok}
            onPress={onSubmit}
          >
            <Text style={styles.buttonText}>登录</Text>
          </Pressable>
          <Pressable style={styles.skipBtn} onPress={() => router.back()}>
            <Text style={styles.skipText}>先不登录,继续看视频</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', justifyContent: 'flex-end', padding: spacing.lg },
  body: { flex: 1, padding: spacing.xl, gap: spacing.lg },
  heroIcon: {
    width: 64, height: 64, borderRadius: 32, backgroundColor: colors.primarySoft,
    alignItems: 'center', justifyContent: 'center',
  },
  title: { ...typography.display, color: colors.text, fontSize: 28 },
  sub: { ...typography.body, color: colors.textMuted, lineHeight: 22 },

  fieldGroup: { gap: spacing.sm },
  inputWrap: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.surface, borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    borderWidth: 1, borderColor: colors.border,
  },
  inputWrapError: { borderColor: colors.danger },
  at: { color: colors.textMuted, fontSize: 18, fontWeight: '600', marginRight: 4 },
  input: { flex: 1, paddingVertical: spacing.md + 2, color: colors.text, ...typography.body, fontSize: 16 },
  counter: { ...typography.tiny, color: colors.textDim, marginLeft: 4 },

  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: spacing.sm },
  errorText: { ...typography.caption, color: colors.danger },
  hint: { ...typography.tiny, color: colors.textDim, paddingHorizontal: spacing.sm },

  button: {
    backgroundColor: colors.primary, paddingVertical: spacing.md + 2, borderRadius: radius.lg,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { ...typography.button, color: '#fff' },
  skipBtn: { alignItems: 'center', paddingVertical: spacing.md },
  skipText: { ...typography.caption, color: colors.textMuted },
});
