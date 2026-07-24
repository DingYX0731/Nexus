// 首页 Feed 内容整理：
// 1) 同系列去重——按 (root_id, author_id) 分组，每组只保留该作者最新一集。
//    效果：同一系列下，不同作者各出一条最新作品；同一作者不重复刷到。
// 2) 打乱顺序——用可复现的种子洗牌，保证同一次浏览顺序稳定（滚动时不跳动），
//    刷新换种子才重排。
import type { Video } from '@/api/types';

/** 分组键：root_id（系列）+ author_id（作者）。缺失时回退到自身 id，独立成条。 */
function dedupKey(v: Video): string {
  const series = v.root_id || v.id;
  const author = v.author_id || `anon:${v.id}`;
  return `${series}::${author}`;
}

/**
 * 同系列同作者只保留 created_at 最新的一集。
 * 返回去重后的数组（顺序不保证，交给 shuffle 处理）。
 */
export function dedupLatestPerAuthorPerSeries(videos: Video[]): Video[] {
  const latest = new Map<string, Video>();
  for (const v of videos) {
    const key = dedupKey(v);
    const cur = latest.get(key);
    if (!cur) { latest.set(key, v); continue; }
    const c = v.created_at.localeCompare(cur.created_at);
    // created_at 更新的胜出；并列按 id 稳定，保证确定性
    if (c > 0 || (c === 0 && v.id > cur.id)) latest.set(key, v);
  }
  return [...latest.values()];
}

/** mulberry32：小巧的可复现 PRNG，同一 seed 产生同一序列。 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 用种子洗牌（Fisher–Yates）。不修改入参，返回新数组。
 * 同一 (items, seed) 永远得到同一顺序 → 浏览过程中稳定。
 */
export function seededShuffle<T>(items: T[], seed: number): T[] {
  const arr = items.slice();
  const rand = mulberry32(seed);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Feed 整理主入口：先按系列+作者去重取最新，再用 seed 打乱。
 * @param seed 每次刷新变一次（顺序随之重排），同次浏览保持不变。
 */
export function curateFeed(videos: Video[], seed: number): Video[] {
  return seededShuffle(dedupLatestPerAuthorPerSeries(videos), seed);
}
