// 用户额度系统(MVP 版本)。
//
// 产品规则:
// - 新用户首次进入有 5 个免费额度
// - 文生视频 / 续写 / Remix 各扣 1 个;剪辑发布免费(不调 AI)
// - 额度耗尽时引导"邀请好友 / 关注公众号" 等假入口(demo 不实现)
//
// 内存存储,App 重启会丢 — MVP 阶段可接受;M3 迁移 Supabase。
import { create } from 'zustand';

export const FREE_INITIAL_CREDITS = 5;
export const COST_GENERATION = 1;

interface CreditsStore {
  // userId -> 剩余额度
  byUser: Record<string, number>;
  ensureInit: (userId: string) => void;
  get: (userId: string) => number;
  charge: (userId: string, amount?: number) => boolean; // 成功返回 true
  refund: (userId: string, amount?: number) => void;
  grant: (userId: string, amount: number) => void;
}

export const useCredits = create<CreditsStore>((set, get) => ({
  byUser: {},
  ensureInit: (userId) => {
    if (get().byUser[userId] == null) {
      set((s) => ({ byUser: { ...s.byUser, [userId]: FREE_INITIAL_CREDITS } }));
    }
  },
  // 注意:不要在 selector 里调 get() —— 会触发 setState,导致 React 报
  // "Maximum update depth exceeded"。
  // 调用方应该:
  //   1. 在 useEffect 里调 ensureInit(userId)
  //   2. 在组件里直接读 byUser[userId] ?? FREE_INITIAL_CREDITS
  get: (userId) => {
    return get().byUser[userId] ?? FREE_INITIAL_CREDITS;
  },
  charge: (userId, amount = COST_GENERATION) => {
    get().ensureInit(userId);
    const cur = get().byUser[userId] ?? 0;
    if (cur < amount) return false;
    set((s) => ({ byUser: { ...s.byUser, [userId]: cur - amount } }));
    return true;
  },
  refund: (userId, amount = COST_GENERATION) => {
    get().ensureInit(userId);
    const cur = get().byUser[userId] ?? 0;
    set((s) => ({ byUser: { ...s.byUser, [userId]: cur + amount } }));
  },
  grant: (userId, amount) => {
    get().ensureInit(userId);
    const cur = get().byUser[userId] ?? 0;
    set((s) => ({ byUser: { ...s.byUser, [userId]: cur + amount } }));
  },
}));
