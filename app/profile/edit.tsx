import { useState, useEffect } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import { X } from 'lucide-react-native';
import { colors, radius, spacing, typography } from '@/theme';
import { useAuth } from '@/store/auth';
import { getProfile, updateProfile, uploadAvatar, UsernameTakenError } from '@/api/supabase/profilesRepo';
import { validateUsername, validateBio } from '@/api/auth/validateUsername';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { showToast } from '@/components/toast/Toast';
import { useT } from '@/i18n';

export default function EditProfileScreen() {
  const t = useT();
  const router = useRouter();
  const qc = useQueryClient();
  const authUser = useAuth((s) => s.user);
  const uid = authUser?.id ?? '';

  // form state
  const [username, setUsername] = useState('');
  const [bio, setBio] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarLocalUri, setAvatarLocalUri] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  const { data: profile, isLoading } = useQuery({
    queryKey: ['profile', uid],
    queryFn: () => getProfile(uid),
    enabled: !!uid,
    staleTime: 30_000,
  });

  // Hydrate form from profile once (use effect to avoid setting state during render)
  useEffect(() => {
    if (profile && !hydrated) {
      setUsername(profile.username ?? '');
      setBio(profile.bio ?? '');
      setAvatarUrl(profile.avatar_url ?? null);
      setHydrated(true);
    }
  }, [profile, hydrated]);

  const pickAvatar = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.6,
    });
    if (!result.canceled && result.assets[0]) {
      setAvatarLocalUri(result.assets[0].uri);
    }
  };

  // username validation (live)
  const usernameValidation = validateUsername(username);
  const bioValidation = validateBio(bio);

  const onSave = async () => {
    const uv = validateUsername(username);
    const bv = validateBio(bio);
    if (!uv.ok) { setErr(uv.msg!); return; }
    if (!bv.ok) { setErr(bv.msg!); return; }
    setErr('');
    setSaving(true);
    try {
      let newAvatarUrl: string | undefined;
      if (avatarLocalUri) {
        try {
          newAvatarUrl = await uploadAvatar(avatarLocalUri);
        } catch {
          showToast({ message: t('edit.avatarUploadFailed') });
        }
      }
      await updateProfile({ username: username.trim(), bio: bio.trim(), avatarUrl: newAvatarUrl });
      // sync auth store username via setUserFromSession
      useAuth.getState().setUserFromSession({
        id: uid,
        username: username.trim(),
        avatar_url: newAvatarUrl ?? avatarUrl ?? authUser?.avatar_url ?? null,
      });
      qc.invalidateQueries({ queryKey: ['profile', uid] });
      qc.invalidateQueries({ queryKey: ['myVideos', uid] });
      showToast({ message: t('common.saved') });
      router.back();
    } catch (e: unknown) {
      if (e instanceof UsernameTakenError) {
        setErr(t('edit.usernameTaken'));
      } else {
        const msg = e instanceof Error ? e.message : t('common.saveFailed');
        setErr(msg);
      }
    } finally {
      setSaving(false);
    }
  };

  // preview avatar: local uri takes priority
  const previewAvatarUser = {
    username,
    avatar_url: avatarLocalUri ?? avatarUrl,
  };

  if (isLoading && !hydrated) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={colors.text} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable hitSlop={12} onPress={() => router.back()} disabled={saving}>
          <X color={saving ? colors.textDim : colors.text} size={24} />
        </Pressable>
        <Text style={styles.headerTitle}>{t('edit.title')}</Text>
        <Pressable
          hitSlop={12}
          onPress={onSave}
          disabled={saving || !hydrated}
          style={[styles.saveBtn, (saving || !hydrated) && styles.saveBtnDisabled]}
        >
          {saving
            ? <ActivityIndicator size="small" color={colors.text} />
            : <Text style={styles.saveBtnText}>{t('common.save')}</Text>}
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Avatar section */}
        <View style={styles.avatarSection}>
          <UserAvatar user={previewAvatarUser} size={88} />
          <Pressable style={styles.changeAvatarBtn} onPress={pickAvatar} disabled={saving}>
            <Text style={styles.changeAvatarText}>{t('edit.changeAvatar')}</Text>
          </Pressable>
        </View>

        {/* Username */}
        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>{t('edit.username')}</Text>
          <TextInput
            style={[
              styles.input,
              !usernameValidation.ok && username.length > 0 && styles.inputError,
            ]}
            value={username}
            onChangeText={(v) => { setUsername(v); setErr(''); }}
            placeholder={t('edit.usernamePlaceholder')}
            placeholderTextColor={colors.textDim}
            autoCapitalize="none"
            autoCorrect={false}
            editable={!saving}
            maxLength={22}
          />
          {!usernameValidation.ok && username.length > 0 && (
            <Text style={styles.fieldError}>{usernameValidation.msg}</Text>
          )}
        </View>

        {/* Bio */}
        <View style={styles.fieldGroup}>
          <View style={styles.fieldLabelRow}>
            <Text style={styles.fieldLabel}>{t('edit.bio')}</Text>
            <Text style={styles.bioCount}>{bio.length}/80</Text>
          </View>
          <TextInput
            style={[
              styles.input,
              styles.bioInput,
              !bioValidation.ok && styles.inputError,
            ]}
            value={bio}
            onChangeText={(v) => { setBio(v); setErr(''); }}
            placeholder={t('edit.bioPlaceholder')}
            placeholderTextColor={colors.textDim}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
            editable={!saving}
            maxLength={80}
          />
          {!bioValidation.ok && (
            <Text style={styles.fieldError}>{bioValidation.msg}</Text>
          )}
        </View>

        {/* Global error */}
        {err.length > 0 && (
          <View style={styles.errBanner}>
            <Text style={styles.errBannerText}>{err}</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  headerTitle: { ...typography.h3, color: colors.text },

  saveBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.pill,
    minWidth: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText: { ...typography.button, color: '#fff' },

  content: {
    padding: spacing.lg,
    gap: spacing.xl,
    paddingBottom: spacing.xxxl,
  },

  avatarSection: {
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  changeAvatarBtn: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.accent,
  },
  changeAvatarText: { ...typography.caption, color: colors.accent },

  fieldGroup: { gap: spacing.xs + 2 },
  fieldLabelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  fieldLabel: { ...typography.captionStrong, color: colors.textMuted },
  bioCount: { ...typography.tiny, color: colors.textDim },
  fieldError: { ...typography.tiny, color: colors.danger },

  input: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    ...typography.body,
  },
  inputError: {
    borderColor: colors.danger,
  },
  bioInput: {
    minHeight: 88,
    paddingTop: spacing.md,
  },

  errBanner: {
    backgroundColor: 'rgba(239,68,68,0.12)',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.3)',
    padding: spacing.md,
  },
  errBannerText: { ...typography.caption, color: colors.danger },
});
