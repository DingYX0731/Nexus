import { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Sparkles } from 'lucide-react-native';
import { useCredits } from '@/store/credits';
import { useAuth } from '@/store/auth';
import { hasSupabase } from '@/api/client';
import { colors, typography } from '@/theme';

export function CreditsDisplay() {
  const { user } = useAuth();
  const uid = user?.id;
  const byUser = useCredits((s) => s.byUser);
  const ensureInit = useCredits((s) => s.ensureInit);
  const syncRemote = useCredits((s) => s.syncRemote);

  useEffect(() => {
    if (!uid) return;
    if (hasSupabase) void syncRemote(uid);
    else ensureInit(uid);
  }, [uid, ensureInit, syncRemote]);

  if (!uid) return null;
  const balance = byUser[uid] ?? 0;

  return (
    <View style={styles.row}>
      <Sparkles color={colors.primary} size={14} />
      <Text style={styles.text}>{balance}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  text: { ...typography.captionStrong, color: colors.text },
});
