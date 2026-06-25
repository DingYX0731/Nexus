// 设计 token —— 灵感来自 TikTok / 小红书 / Lemon8。
// 原则:背景纯黑(沉浸感),前景白 + 抑制的中性色阶;点缀色克制只用于强调(点赞红 / 关键 CTA)。
// 字号字重严格 hierarchy:title > body > caption > tiny。

export const colors = {
  // 背景层
  bg: '#000000',
  bgElevated: '#0a0a0a',
  surface: '#141414',
  surfaceAlt: '#1c1c1e',
  surfaceHi: '#262628',
  border: 'rgba(255,255,255,0.08)',
  borderStrong: 'rgba(255,255,255,0.14)',

  // 文字层
  text: '#ffffff',
  textSecondary: 'rgba(255,255,255,0.85)',
  textMuted: 'rgba(255,255,255,0.55)',
  textDim: 'rgba(255,255,255,0.32)',
  textInverse: '#0a0a0a',

  // 品牌色
  primary: '#fe2c55',         // TikTok 红 — 点赞 / 主 CTA
  primarySoft: 'rgba(254,44,85,0.16)',
  primaryDim: 'rgba(254,44,85,0.55)',
  accent: '#25f4ee',          // TikTok 青 — 次要 CTA / 链接
  accentSoft: 'rgba(37,244,238,0.14)',

  // 语义色
  success: '#22c55e',
  warning: '#f59e0b',
  danger: '#ef4444',

  // 遮罩
  overlay: 'rgba(0,0,0,0.55)',
  overlayLight: 'rgba(0,0,0,0.32)',
  scrim: 'rgba(0,0,0,0.75)',
  glass: 'rgba(20,20,20,0.78)',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const radius = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  pill: 999,
} as const;

export const typography = {
  display: { fontSize: 32, fontWeight: '800' as const, letterSpacing: -0.5 },
  h1: { fontSize: 24, fontWeight: '700' as const, letterSpacing: -0.3 },
  h2: { fontSize: 20, fontWeight: '700' as const, letterSpacing: -0.2 },
  h3: { fontSize: 17, fontWeight: '600' as const },
  body: { fontSize: 15, fontWeight: '400' as const, lineHeight: 22 },
  bodyStrong: { fontSize: 15, fontWeight: '600' as const, lineHeight: 22 },
  caption: { fontSize: 13, fontWeight: '400' as const, lineHeight: 18 },
  captionStrong: { fontSize: 13, fontWeight: '600' as const },
  tiny: { fontSize: 11, fontWeight: '500' as const },
  button: { fontSize: 15, fontWeight: '700' as const, letterSpacing: 0.2 },
} as const;

export const shadows = {
  card: {
    shadowColor: '#000',
    shadowOpacity: 0.32,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  sheet: {
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: -8 },
    elevation: 16,
  },
} as const;

export const motion = {
  fast: 150,
  base: 220,
  slow: 320,
} as const;
