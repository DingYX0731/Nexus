import { Tabs } from 'expo-router';
import { View, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Home, Plus, Bell, User } from 'lucide-react-native';
import { useQuery } from '@tanstack/react-query';
import { colors, typography } from '@/theme';
import { TAB_BAR_BASE } from '@/hooks/useTabBarSpace';
import { hasSupabase } from '@/api/client';
import { unreadCountRemote } from '@/api/supabase/notificationsRepo';
import { useT } from '@/i18n';

export default function TabLayout() {
  const t = useT();
  const insets = useSafeAreaInsets();
  const tabBarHeight = TAB_BAR_BASE + insets.bottom;

  const { data: unreadCount = 0 } = useQuery({
    queryKey: ['unreadCount'],
    queryFn: unreadCountRemote,
    enabled: hasSupabase,
    refetchInterval: 30000,
    refetchOnWindowFocus: true,
  });

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: true,
        tabBarStyle: [
          styles.tabBar,
          { height: tabBarHeight, paddingBottom: insets.bottom },
        ],
        tabBarItemStyle: { paddingTop: 8 },
        tabBarActiveTintColor: colors.text,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: { ...typography.tiny, marginTop: 2 },
        tabBarBackground: () => <View style={styles.tabBarBg} />,
        sceneStyle: { backgroundColor: '#000' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t('tab.home'),
          tabBarIcon: ({ color, focused }) => (
            <Home color={color} size={24} fill={focused ? color : 'transparent'} strokeWidth={focused ? 2.4 : 2} />
          ),
        }}
      />
      <Tabs.Screen
        name="create"
        options={{
          title: t('tab.create'),
          tabBarIcon: ({ color, focused }) => (
            <Plus color={color} size={26} strokeWidth={focused ? 2.6 : 2.2} />
          ),
        }}
      />
      <Tabs.Screen
        name="inbox"
        options={{
          title: t('tab.inbox'),
          tabBarBadge: unreadCount > 0 ? unreadCount : undefined,
          tabBarIcon: ({ color, focused }) => (
            <Bell color={color} size={24} fill={focused ? color : 'transparent'} strokeWidth={focused ? 2.4 : 2} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t('tab.profile'),
          tabBarIcon: ({ color, focused }) => (
            <User color={color} size={24} fill={focused ? color : 'transparent'} strokeWidth={focused ? 2.4 : 2} />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    position: 'absolute',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: 'transparent',
    elevation: 0,
  },
  tabBarBg: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.glass,
  },
});
