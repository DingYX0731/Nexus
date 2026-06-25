import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { Stack } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';
import 'react-native-url-polyfill/auto';
import { ToastHost } from '@/components/toast/Toast';
import { ConfirmDialogHost } from '@/components/dialog/ConfirmDialog';
import { preloadDemoVideos } from '@/ai/demoVideos';

// 保险:即使 RootLayout 抛错,也在 1.5s 后让 splash 消失,这样能看到红屏报错而不是空 logo。
SplashScreen.preventAutoHideAsync().catch(() => undefined);
setTimeout(() => {
  SplashScreen.hideAsync().catch(() => undefined);
}, 1500);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  },
});

export default function RootLayout() {
  useEffect(() => {
    SplashScreen.hideAsync().catch(() => undefined);
    // 预解析打包的 demo 视频资源,确保首帧/播放前 localUri 就绪。
    preloadDemoVideos().catch(() => undefined);
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: '#000' }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <StatusBar style="light" />
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: '#000' },
              animation: 'slide_from_right',
            }}
          >
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="video/[id]" options={{ presentation: 'card' }} />
            <Stack.Screen name="remix/[id]" options={{ presentation: 'modal' }} />
            <Stack.Screen name="editor/[id]" options={{ presentation: 'modal' }} />
            <Stack.Screen name="auth/login" options={{ presentation: 'modal' }} />
            <Stack.Screen name="settings" options={{ presentation: 'modal' }} />
          </Stack>
          <ToastHost />
          <ConfirmDialogHost />
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
