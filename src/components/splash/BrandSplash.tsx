// 品牌启动页：app 冷启动时全屏盖一张 logo，停留后淡出，露出下方内容。
// 纯 JS 实现（不依赖原生 splash 重建），受 shouldShow 控制只在本次进程首次挂载显示。
import { useEffect } from 'react';
import { Image, StyleSheet, Dimensions } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming, withDelay, runOnJS } from 'react-native-reanimated';

// 模块级标记：同一 JS 进程内只显示一次。
// 「删后台重开」= 新进程 → 重新显示；「短时间切回」= 同进程 → 不显示。正好符合需求。
let shownThisSession = false;

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
// logo 用屏宽的 50%（固定像素，避免百分比在 Image 上失效导致溢出）。方图，宽=高。
const LOGO_SIZE = Math.round(SCREEN_W * 0.5);
// 让 logo 中心落在约 43% 屏高（中间偏上）：容器居中(50%)后，用 marginTop 上移。
const SHIFT_UP = Math.round(SCREEN_H * 0.07);

export function BrandSplash({ onDone }: { onDone: () => void }) {
  const opacity = useSharedValue(1);

  useEffect(() => {
    // 停留 1.3s 后用 400ms 淡出，结束回调通知父组件卸载
    opacity.value = withDelay(1300, withTiming(0, { duration: 400 }, (finished) => {
      if (finished) runOnJS(onDone)();
    }));
  }, [opacity, onDone]);

  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View style={[StyleSheet.absoluteFillObject, styles.root, style]} pointerEvents="none">
      <Image
        source={require('../../../assets/images/nexus-logo.png')}
        style={styles.logo}
        resizeMode="contain"
      />
    </Animated.View>
  );
}

/** 本次进程是否还需要显示启动页（首次 true，之后 false）。 */
export function consumeSplashShow(): boolean {
  if (shownThisSession) return false;
  shownThisSession = true;
  return true;
}

const styles = StyleSheet.create({
  root: { backgroundColor: '#000', alignItems: 'center', justifyContent: 'center', zIndex: 999 },
  // 固定像素尺寸，方图居中；marginBottom 把 logo 从正中上移到中间偏上。
  logo: { width: LOGO_SIZE, height: LOGO_SIZE, marginBottom: SHIFT_UP * 2 },
});
