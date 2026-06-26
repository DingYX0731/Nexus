import { useState, useMemo } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { X, Sparkles, AlertCircle } from 'lucide-react-native';
import { colors, radius, spacing, typography } from '@/theme';
import { useAuth } from '@/store/auth';
import { validateEmail, validatePassword, validateUsername } from '@/api/auth/validateUsername';

export default function LoginScreen() {
  const router = useRouter();
  const { signUp, signIn } = useAuth();
  const [mode, setMode] = useState<'signIn' | 'signUp'>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const emailV = useMemo(() => validateEmail(email), [email]);
  const pwV = useMemo(() => validatePassword(password), [password]);
  const nameV = useMemo(() => validateUsername(username), [username]);
  const canSubmit =
    emailV.ok && pwV.ok && (mode === 'signIn' || nameV.ok) && !submitting;

  const onSubmit = async () => {
    setServerError(null);
    if (!canSubmit) return;
    setSubmitting(true);
    const res = mode === 'signUp'
      ? await signUp(email.trim(), password, username.trim())
      : await signIn(email.trim(), password);
    setSubmitting(false);
    if (res.ok) router.back();
    else setServerError(res.error ?? '操作失败，请重试');
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
          <Text style={styles.title}>
            {mode === 'signIn' ? '登录账号' : '创建账号'}
          </Text>
          <Text style={styles.sub}>
            {mode === 'signIn'
              ? '登录后获得 5 个免费额度，可生成 AI 视频、点赞、续写。'
              : '注册后获得 5 个免费额度，可生成 AI 视频、点赞、续写。'}
          </Text>

          <View style={styles.fieldGroup}>
            {/* Email */}
            <View style={styles.inputWrap}>
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                placeholder="邮箱"
                placeholderTextColor={colors.textDim}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                onSubmitEditing={onSubmit}
                returnKeyType="next"
              />
            </View>

            {/* Password */}
            <View style={styles.inputWrap}>
              <TextInput
                style={styles.input}
                value={password}
                onChangeText={setPassword}
                placeholder="密码（至少 6 位）"
                placeholderTextColor={colors.textDim}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                onSubmitEditing={onSubmit}
                returnKeyType={mode === 'signUp' ? 'next' : 'done'}
              />
            </View>

            {/* Username — signUp only */}
            {mode === 'signUp' && (
              <View style={styles.inputWrap}>
                <TextInput
                  style={styles.input}
                  value={username}
                  onChangeText={setUsername}
                  placeholder="用户名（2-20 字符）"
                  placeholderTextColor={colors.textDim}
                  autoCapitalize="none"
                  autoCorrect={false}
                  maxLength={20}
                  onSubmitEditing={onSubmit}
                  returnKeyType="done"
                />
              </View>
            )}
          </View>

          {/* Server error */}
          {serverError ? (
            <View style={styles.errorRow}>
              <AlertCircle color={colors.danger} size={13} />
              <Text style={styles.errorText}>{serverError}</Text>
            </View>
          ) : null}

          <Pressable
            style={[styles.button, !canSubmit && styles.buttonDisabled]}
            disabled={!canSubmit}
            onPress={onSubmit}
          >
            <Text style={styles.buttonText}>
              {submitting ? '请稍候…' : mode === 'signIn' ? '登录' : '注册'}
            </Text>
          </Pressable>

          {/* Mode toggle */}
          <Pressable onPress={() => { setMode(mode === 'signIn' ? 'signUp' : 'signIn'); setServerError(null); }}>
            <Text style={styles.skipText}>
              {mode === 'signIn' ? '没有账号？去注册' : '已有账号？去登录'}
            </Text>
          </Pressable>

          {/* Anonymous skip */}
          <Pressable style={styles.skipBtn} onPress={() => router.back()}>
            <Text style={styles.skipText}>先不登录，继续看视频</Text>
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
  input: { flex: 1, paddingVertical: spacing.md + 2, color: colors.text, ...typography.body, fontSize: 16 },

  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: spacing.sm },
  errorText: { ...typography.caption, color: colors.danger },

  button: {
    backgroundColor: colors.primary, paddingVertical: spacing.md + 2, borderRadius: radius.lg,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { ...typography.button, color: '#fff' },
  skipBtn: { alignItems: 'center', paddingVertical: spacing.md },
  skipText: { ...typography.caption, color: colors.textMuted },
});
