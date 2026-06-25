import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * 统一计算各页面避开底部 Tab Bar / Home indicator 所需的 padding。
 * 不能硬编码 `Platform.OS === 'ios' ? 84 : 64` —— 真机不同厂商的 home indicator
 * 高度不同(vivo X300 Pro 等会被遮挡),必须从 SafeAreaInsets 动态算。
 *
 * - Tab Bar 自身的可视高度 = 56(icon + label)
 * - Tab Bar 容器实际高度 = TAB_BAR_BASE + insets.bottom(给 home indicator 让位)
 */
export const TAB_BAR_BASE = Platform.OS === 'ios' ? 56 : 56;

export function useTabBarSpace() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = TAB_BAR_BASE + insets.bottom;
  return {
    insets,
    tabBarHeight,
    /** padding-bottom 让滚动内容尾部不被 tab bar 遮挡 */
    contentBottomPad: tabBarHeight + 16,
  };
}
