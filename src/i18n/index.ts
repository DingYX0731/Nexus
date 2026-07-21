// 轻量自建 i18n：t(key, vars?) + zh/en 词典 + 语言 store（持久化，跟随系统可覆盖）。
//
// 用法：
//   import { useT } from '@/i18n';           // 组件内（订阅语言变化，切换即重渲染）
//   const t = useT();  t('common.save')
//   import { t } from '@/i18n';               // 非组件（store/工具函数），取当前语言
//
// 语言来源优先级：用户在设置里选过 > 系统语言 > 默认 zh。
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NativeModules, Platform } from 'react-native';
import { translations, type Lang, type TransKey } from './translations';

// 读系统语言，用 RN 内置 API（不引入原生模块，无需重建 dev client）。
function deviceLocale(): string {
  try {
    if (Platform.OS === 'ios') {
      const s = NativeModules.SettingsManager?.settings;
      return (
        s?.AppleLocale ||
        s?.AppleLanguages?.[0] ||
        'zh'
      );
    }
    return NativeModules.I18nManager?.localeIdentifier ?? 'zh';
  } catch {
    return 'zh';
  }
}

function systemLang(): Lang {
  const code = deviceLocale().toLowerCase();
  return code.startsWith('zh') ? 'zh' : 'en';
}

interface I18nState {
  lang: Lang;
  followSystem: boolean;      // true=跟随系统；用户手动选后置 false
  setLang: (l: Lang) => void; // 手动选语言（关掉 followSystem）
  useSystem: () => void;      // 恢复跟随系统
}

export const useI18n = create<I18nState>()(
  persist(
    (set) => ({
      lang: systemLang(),
      followSystem: true,
      setLang: (l) => set({ lang: l, followSystem: false }),
      useSystem: () => set({ lang: systemLang(), followSystem: true }),
    }),
    {
      name: 'app-lang',
      storage: createJSONStorage(() => AsyncStorage),
      // 跟随系统时，每次启动用系统语言校准（系统语言可能变了）
      onRehydrateStorage: () => (state) => {
        if (state?.followSystem) state.lang = systemLang();
      },
    },
  ),
);

// 简单插值：t('x.y', { n: 3 }) 替换字符串里的 {n}
function interpolate(str: string, vars?: Record<string, string | number>): string {
  if (!vars) return str;
  return str.replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? String(vars[k]) : `{${k}}`));
}

function translate(lang: Lang, key: TransKey, vars?: Record<string, string | number>): string {
  const dict = translations[lang] as Record<string, string>;
  const fallback = translations.zh as Record<string, string>;
  const raw = dict[key] ?? fallback[key] ?? key;
  return interpolate(raw, vars);
}

/** 非组件上下文用：取当前语言翻译（不订阅变化）。 */
export function t(key: TransKey, vars?: Record<string, string | number>): string {
  return translate(useI18n.getState().lang, key, vars);
}

/** 组件内用：返回订阅了语言变化的 t，切换语言时组件自动重渲染。 */
export function useT(): (key: TransKey, vars?: Record<string, string | number>) => string {
  const lang = useI18n((s) => s.lang);
  return (key, vars) => translate(lang, key, vars);
}

export type { Lang, TransKey } from './translations';
