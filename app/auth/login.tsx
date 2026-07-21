import { useState, useMemo } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { X, Sparkles, AlertCircle } from 'lucide-react-native';
import { colors, radius, spacing, typography } from '@/theme';
import { useAuth } from '@/store/auth';
import { validateEmail, validatePassword, validateUsername } from '@/api/auth/validateUsername';
import { useT } from '@/i18n';

export default function LoginScreen() {
  const router = useRouter();
  const t = useT();
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
    else setServerError(res.error ?? t('login.failed'));
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
            {mode === 'signIn' ? t('login.signInTitle') : t('login.signUpTitle')}
          </Text>
          <Text style={styles.sub}>
            {mode === 'signIn'
              ? t('login.signInSub')
              : t('login.signUpSub')}
          </Text>

          <View style={styles.fieldGroup}>
            {/* Email */}
            <View style={styles.inputWrap}>
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                placeholder={t('login.email')}
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
                placeholder={t('login.password')}
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
                  placeholder={t('login.username')}
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
              {submitting ? t('login.submitting') : mode === 'signIn' ? t('login.signIn') : t('login.signUp')}
            </Text>
          </Pressable>

          {/* Mode toggle */}
          <Pressable onPress={() => { setMode(mode === 'signIn' ? 'signUp' : 'signIn'); setServerError(null); }}>
            <Text style={styles.skipText}>
              {mode === 'signIn' ? t('login.toSignUp') : t('login.toSignIn')}
            </Text>
          </Pressable>

          {/* Anonymous skip */}
          <Pressable style={styles.skipBtn} onPress={() => router.back()}>
            <Text style={styles.skipText}>{t('login.skip')}</Text>
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
