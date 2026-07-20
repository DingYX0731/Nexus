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
 * 抽取视频接近末尾的一帧,返回 file:// URI。用于续写:把上一段视频的最后一帧当作新视频首帧。
 * 豆包不返回视频末帧,所以由客户端在这里抽。
 * @param videoUrl 视频地址
 * @param durationMs 视频时长(毫秒),用于定位末帧;缺省时退回抽 1s 处
 */
export async function extractLastFrame(videoUrl: string, durationMs?: number | null): Promise<string | null> {
  // 定位到结尾前 ~120ms,避开某些编码最后一帧解不出的情况;时长未知时退回 1s。
  const time = durationMs && durationMs > 200 ? Math.max(0, durationMs - 120) : 1000;
  try {
    const { uri } = await VideoThumbnails.getThumbnailAsync(videoUrl, { time, quality: 0.8 });
    return uri;
  } catch {
    return null;
  }
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
