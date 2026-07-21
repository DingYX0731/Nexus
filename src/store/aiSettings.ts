// AI 生成设置：provider 选择 + 模型选择 + 用户自带 API key。
//
// 安全设计（要点）：
// - provider / 选中的 model：普通偏好，持久化到 AsyncStorage 即可。
// - API key：属敏感凭证，**只**存 iOS Keychain / Android Keystore（expo-secure-store），
//   绝不写进 AsyncStorage、Zustand persist、日志或任何普通存储。内存里只在需要上送时短暂读取。
// - 上送：每次生成/轮询时从 SecureStore 现取 key、HTTPS 传给 Edge Function，用完即弃；
//   服务端不落库、不打日志、不透传上游报错（见 supabase/functions）。
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

// 目前平台实测可用的 provider / 模型（用户 key 无权限的不在此列）。
export type ProviderId = 'doubao';

export interface ModelOption {
  id: string;          // 传给上游的 model 值
  label: string;       // UI 显示名
  note?: string;       // 说明
}

export const PROVIDERS: {
  id: ProviderId;
  label: string;
  keyHint: string;     // 填 key 时的引导
  models: ModelOption[];
}[] = [
  {
    id: 'doubao',
    label: '豆包 Seedance（Paratera 中转）',
    keyHint: '在 llmapi.paratera.com 获取的 API Key',
    models: [
      { id: 'Doubao-Seedance-1.0-Pro', label: 'Seedance 1.0 Pro', note: '文生/图生视频 · 已验证可用' },
    ],
  },
];

const KEY_STORE_PREFIX = 'ai_api_key_'; // 每个 provider 一个 SecureStore 键

// API key 合法性：非空、无空白字符、长度受限（防误粘贴整段文本/超大 payload）。
const KEY_MAX_LEN = 400;
export function isValidApiKeyFormat(key: string): boolean {
  if (!key) return false;
  if (key.length > KEY_MAX_LEN) return false;
  if (/\s/.test(key)) return false; // 不允许空格/换行/制表符
  return true;
}

interface AiSettingsState {
  provider: ProviderId;
  modelByProvider: Record<string, string>; // provider -> 选中的 model id
  hasKey: Record<string, boolean>;          // provider -> 是否已配置 key（仅标记，不含 key 本身）
  setProvider: (p: ProviderId) => void;
  setModel: (p: ProviderId, modelId: string) => void;
  /** 保存 key 到 SecureStore（校验格式）。返回是否成功。 */
  saveKey: (p: ProviderId, key: string) => Promise<boolean>;
  /** 清除某 provider 的 key。 */
  clearKey: (p: ProviderId) => Promise<void>;
  /** 读取 key（仅生成/轮询上送时调用，绝不渲染到 UI）。 */
  getKey: (p: ProviderId) => Promise<string | null>;
  /** 启动时同步 hasKey 标记（SecureStore 是真源）。 */
  refreshHasKey: () => Promise<void>;
}

function defaultModelFor(p: ProviderId): string {
  return PROVIDERS.find((x) => x.id === p)?.models[0]?.id ?? '';
}

export const useAiSettings = create<AiSettingsState>()(
  persist(
    (set, get) => ({
      provider: 'doubao',
      modelByProvider: { doubao: defaultModelFor('doubao') },
      hasKey: {},

      setProvider: (p) => set({ provider: p }),
      setModel: (p, modelId) =>
        set((s) => ({ modelByProvider: { ...s.modelByProvider, [p]: modelId } })),

      saveKey: async (p, key) => {
        const trimmed = key.trim();
        if (!isValidApiKeyFormat(trimmed)) return false;
        await SecureStore.setItemAsync(KEY_STORE_PREFIX + p, trimmed, {
          keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
        });
        set((s) => ({ hasKey: { ...s.hasKey, [p]: true } }));
        return true;
      },

      clearKey: async (p) => {
        await SecureStore.deleteItemAsync(KEY_STORE_PREFIX + p);
        set((s) => ({ hasKey: { ...s.hasKey, [p]: false } }));
      },

      getKey: async (p) => {
        try {
          return await SecureStore.getItemAsync(KEY_STORE_PREFIX + p);
        } catch {
          return null;
        }
      },

      refreshHasKey: async () => {
        const result: Record<string, boolean> = {};
        for (const prov of PROVIDERS) {
          try {
            const v = await SecureStore.getItemAsync(KEY_STORE_PREFIX + prov.id);
            result[prov.id] = !!v;
          } catch {
            result[prov.id] = false;
          }
        }
        set({ hasKey: result });
      },
    }),
    {
      name: 'ai-settings',
      storage: createJSONStorage(() => AsyncStorage),
      // 只持久化偏好，绝不持久化 key（key 只在 SecureStore）。hasKey 启动时用 refreshHasKey 校准。
      partialize: (s) => ({ provider: s.provider, modelByProvider: s.modelByProvider }),
    },
  ),
);
