import { create } from 'zustand';
import type { AuthUser } from '@/api/types';
import type { useRouter } from 'expo-router';

type RouterLike = ReturnType<typeof useRouter>;

interface AuthState {
  user: AuthUser | null;
  isAnonymous: boolean;
  signInMock: (username: string) => void;
  signOut: () => void;
  requireAuth: (router: RouterLike) => boolean;
}

export const useAuth = create<AuthState>((set, get) => ({
  user: null,
  isAnonymous: true,
  signInMock: (username) =>
    set({
      user: { id: `local_${username}`, username },
      isAnonymous: false,
    }),
  signOut: () => set({ user: null, isAnonymous: true }),
  requireAuth: (router) => {
    if (get().user) return true;
    router.push('/auth/login');
    return false;
  },
}));
