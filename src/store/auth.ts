import { create } from 'zustand';
import type { AuthUser } from '@/api/types';
import type { useRouter } from 'expo-router';
import { supabase, hasSupabase } from '@/api/client';

type RouterLike = ReturnType<typeof useRouter>;

interface AuthState {
  user: AuthUser | null;
  isAnonymous: boolean;
  signUp: (email: string, password: string, username: string) => Promise<{ ok: boolean; error?: string }>;
  signIn: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  signOut: () => Promise<void>;
  hydrateSession: () => Promise<void>;
  setUserFromSession: (user: AuthUser | null) => void;
  signInMock: (username: string) => void; // 保底：hasSupabase=false 时用
  requireAuth: (router: RouterLike) => boolean;
}

async function profileUsername(userId: string, fallback: string): Promise<string> {
  try {
    const { data } = await supabase().from('profiles').select('username').eq('id', userId).single();
    return data?.username ?? fallback;
  } catch {
    return fallback;
  }
}

export const useAuth = create<AuthState>((set, get) => ({
  user: null,
  isAnonymous: true,

  signUp: async (email, password, username) => {
    if (!hasSupabase) { get().signInMock(username); return { ok: true }; }
    const { data, error } = await supabase().auth.signUp({
      email, password, options: { data: { username } },
    });
    if (error) return { ok: false, error: error.message };
    const u = data.user;
    if (u) set({ user: { id: u.id, username }, isAnonymous: false });
    return { ok: true };
  },

  signIn: async (email, password) => {
    if (!hasSupabase) { get().signInMock(email.split('@')[0] ?? 'user'); return { ok: true }; }
    const { data, error } = await supabase().auth.signInWithPassword({ email, password });
    if (error) return { ok: false, error: error.message };
    const u = data.user;
    if (u) {
      const username = await profileUsername(u.id, email.split('@')[0] ?? 'user');
      set({ user: { id: u.id, username }, isAnonymous: false });
    }
    return { ok: true };
  },

  signOut: async () => {
    if (hasSupabase) { try { await supabase().auth.signOut(); } catch {} }
    set({ user: null, isAnonymous: true });
  },

  hydrateSession: async () => {
    if (!hasSupabase) return;
    try {
      const { data } = await supabase().auth.getSession();
      const u = data.session?.user;
      if (u) {
        const username = await profileUsername(u.id, u.email?.split('@')[0] ?? 'user');
        set({ user: { id: u.id, username }, isAnonymous: false });
      }
    } catch {}
  },

  setUserFromSession: (user) => set({ user, isAnonymous: !user }),

  signInMock: (username) =>
    set({ user: { id: `local_${username}`, username }, isAnonymous: false }),

  requireAuth: (router) => {
    if (get().user) return true;
    router.push('/auth/login');
    return false;
  },
}));
