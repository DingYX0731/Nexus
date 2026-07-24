// 视频首帧缓存 hook —— 用于没有 thumbnail_url 的视频(豆包等 provider 不返回封面)。
// 全局缓存,避免重复抽帧。
import { useEffect, useState } from 'react';
import * as VideoThumbnails from 'expo-video-thumbnails';
import * as FileSystem from 'expo-file-system';

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

// 视频约定固定 5s（豆包 --dur 5）。duration 缺失时用它兜底定位片尾，
// 绝不能退回 1s（对 5s 视频那是接近开头，会导致续写"从头开始"而非承接结尾）。
const ASSUMED_DURATION_MS = 5000;

/**
 * 抽取视频接近末尾的一帧,返回 file:// URI。用于续写:把上一段视频的最后一帧当作新视频首帧。
 * 豆包不返回视频末帧,所以由客户端在这里抽。
 *
 * iOS 上 getThumbnailAsync 对「远程 URL」抽帧很不稳(常静默失败)。因此先把远程视频
 * 下载到本地缓存,再对 file:// 本地文件抽帧,可靠得多;抽完清理临时文件。
 *
 * @param videoUrl 视频地址(可能是远程 https 或本地 file://)
 * @param durationMs 视频时长(毫秒),用于定位末帧;缺省时按约定的 5s 兜底
 */
export async function extractLastFrame(videoUrl: string, durationMs?: number | null): Promise<string | null> {
  // 定位到结尾前 ~120ms,避开某些编码最后一帧解不出的情况;时长未知时按 5s 约定兜底。
  const total = durationMs && durationMs > 200 ? durationMs : ASSUMED_DURATION_MS;
  const time = Math.max(0, total - 120);

  const isRemote = /^https?:\/\//i.test(videoUrl);
  let localUri = videoUrl;
  let tempFile: Awaited<ReturnType<typeof FileSystem.File.downloadFileAsync>> | null = null;

  try {
    // 远程视频先下载到缓存目录，抽帧对本地文件更可靠(尤其 iOS)。
    if (isRemote) {
      try {
        const dest = new FileSystem.File(FileSystem.Paths.cache, `cont-src-${Date.now()}.mp4`);
        const downloaded = await FileSystem.File.downloadFileAsync(videoUrl, dest, { idempotent: true });
        tempFile = downloaded;
        localUri = downloaded.uri;
      } catch {
        // 下载失败则退回直接对远程 URL 抽帧(可能失败，但不放弃)
        localUri = videoUrl;
      }
    }

    // 优先按定位时间抽片尾；失败再退一步(不带 time，抽首帧)保底出图。
    try {
      const { uri } = await VideoThumbnails.getThumbnailAsync(localUri, { time, quality: 0.8 });
      return uri;
    } catch {
      try {
        const { uri } = await VideoThumbnails.getThumbnailAsync(localUri, { quality: 0.8 });
        return uri;
      } catch {
        return null;
      }
    }
  } finally {
    // 清理下载的临时视频
    if (tempFile) {
      try { tempFile.delete(); } catch { /* 清理失败无妨 */ }
    }
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
