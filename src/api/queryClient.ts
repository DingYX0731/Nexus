import { QueryClient } from '@tanstack/react-query';

// 全局共享的 react-query client。
// _layout.tsx 用它作 Provider；非组件代码（如 zustand store jobs.ts）也能 import
// 来 invalidate 缓存，触发屏幕从云端重新拉取。
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  },
});
