import { View, Text, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { avatarColorFor } from './avatarColor';

interface UserAvatarProps {
  user?: { username?: string | null; avatar_url?: string | null } | null;
  size?: number;
}

export function UserAvatar({ user, size = 40 }: UserAvatarProps) {
  const username = user?.username ?? '';
  const initial = username ? username.slice(0, 1).toUpperCase() : '?';
  const radius = size / 2;

  if (user?.avatar_url) {
    return (
      <Image
        source={{ uri: user.avatar_url }}
        style={{ width: size, height: size, borderRadius: radius }}
        contentFit="cover"
      />
    );
  }
  return (
    <View style={[styles.fallback, { width: size, height: size, borderRadius: radius, backgroundColor: avatarColorFor(username) }]}>
      <Text style={[styles.initial, { fontSize: size * 0.42 }]}>{initial}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: { alignItems: 'center', justifyContent: 'center' },
  initial: { color: '#fff', fontWeight: '700' },
});
