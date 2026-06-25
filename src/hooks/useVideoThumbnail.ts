// 视频首帧缓存 hook —— 用于没有 thumbnail_url 的视频(豆包等 provider 不返回封面)。
// 全局缓存,避免重复抽帧。
import { useEffect, useState } from 'react';
import * as VideoThumbnails from 'expo-video-thumbnails';

const cache = new Map<string, string>();
const inFlight = new Map<string, Promise<string | null>>();

async function ensureThumbnail(videoUrl: string): Promise<string | null> {
  if (cache.has(videoUrl)) return cache.get(videoUrl)!;
  if (inFlight.has(videoUrl)) return inFlight.get(videoUrl)!;
  const p = (async () => {
    try {
      const { uri } = await VideoThumbnails.getThumbnailAsync(videoUrl, {
        time: 0,
        quality: 0.7,
      });
      cache.set(videoUrl, uri);
      return uri;
    } catch {
      return null;
    } finally {
      inFlight.delete(videoUrl);
    }
  })();
  inFlight.set(videoUrl, p);
  return p;
}

/**
 * 返回视频首帧 file:// URI。
 * 第一次调用会异步抽帧;之后命中缓存立即返回。
 * 如果传入了 fallback 且抽帧未完成,会先返回 fallback。
 */
export function useVideoThumbnail(videoUrl: string | undefined, fallback?: string | null): string | null {
  const [uri, setUri] = useState<string | null>(() => {
    if (!videoUrl) return fallback ?? null;
    return cache.get(videoUrl) ?? fallback ?? null;
  });

  useEffect(() => {
    if (!videoUrl) return;
    if (cache.has(videoUrl)) {
      setUri(cache.get(videoUrl)!);
      return;
    }
    let cancelled = false;
    ensureThumbnail(videoUrl).then((u) => {
      if (!cancelled && u) setUri(u);
    });
    return () => { cancelled = true; };
  }, [videoUrl]);

  return uri;
}
