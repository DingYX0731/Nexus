// API key 存储抽象：优先系统钥匙串(expo-secure-store)，原生模块不可用时降级到 AsyncStorage。
//
// 为什么要降级：expo-secure-store 是原生模块，需重建 dev client 才有。若当前二进制没有它，
// 直接 import 会在加载时崩溃。这里用 lazy require + try/catch 探测，缺失则退回 AsyncStorage，
// 保证 app 始终能启动。重建 dev client 后自动切回安全存储。
import AsyncStorage from '@react-native-async-storage/async-storage';

type SecureStoreModule = {
  setItemAsync: (k: string, v: string, opts?: Record<string, unknown>) => Promise<void>;
  getItemAsync: (k: string) => Promise<string | null>;
  deleteItemAsync: (k: string) => Promise<void>;
  WHEN_UNLOCKED_THIS_DEVICE_ONLY?: unknown;
};

// 惰性探测原生模块，只探一次。访问任一方法若抛错即视为不可用。
let cached: SecureStoreModule | null | undefined;
function getSecureStore(): SecureStoreModule | null {
  if (cached !== undefined) return cached;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('expo-secure-store') as SecureStoreModule;
    // 触发一次原生桥访问，确认真的可用（有些环境 require 成功但调用才抛）
    if (typeof mod?.getItemAsync !== 'function') throw new Error('no getItemAsync');
    cached = mod;
  } catch {
    cached = null;
  }
  return cached;
}

/** 当前是否使用安全钥匙串（false = 已降级到 AsyncStorage）。供 UI 提示用。 */
export function isSecureStorageAvailable(): boolean {
  return getSecureStore() !== null;
}

const FALLBACK_PREFIX = 'insecure_key_'; // AsyncStorage 降级键前缀

export async function setKey(storeKey: string, value: string): Promise<void> {
  const ss = getSecureStore();
  if (ss) {
    await ss.setItemAsync(storeKey, value, {
      keychainAccessible: ss.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  } else {
    await AsyncStorage.setItem(FALLBACK_PREFIX + storeKey, value);
  }
}

export async function getKey(storeKey: string): Promise<string | null> {
  const ss = getSecureStore();
  try {
    if (ss) return await ss.getItemAsync(storeKey);
    return await AsyncStorage.getItem(FALLBACK_PREFIX + storeKey);
  } catch {
    return null;
  }
}

export async function deleteKey(storeKey: string): Promise<void> {
  const ss = getSecureStore();
  if (ss) {
    await ss.deleteItemAsync(storeKey);
  } else {
    await AsyncStorage.removeItem(FALLBACK_PREFIX + storeKey);
  }
}
