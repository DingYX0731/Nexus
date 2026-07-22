// 主页作品/点赞网格的「按系列折叠」聚合。
// 同一 root_id 的多个续写节点折叠为一格，封面取系列内最新叶子（created_at 最大），
// 角标显示该系列在这批视频里拥有的节点数。详情页的圆点树负责进去后切换到任意一集。
import type { Video } from '@/api/types';

export interface SeriesGroupItem {
  /** 用于渲染的封面视频（系列内最新创建的节点） */
  cover: Video;
  /** 该系列在这批视频里的节点数（=折叠了几个）。1 表示未折叠的单集。 */
  count: number;
  /** 分组键：root_id（缺失时回退到自身 id，视为独立系列） */
  seriesId: string;
}

/** 取分组键：优先 root_id；异常数据缺失时用自身 id，保证每条至少独立成组。 */
function seriesKey(v: Video): string {
  return v.root_id || v.id;
}

/**
 * 把一批视频按 root_id 折叠成系列条目。
 * - 每个系列一格，封面 = created_at 最新的节点（最新叶子）
 * - count = 该系列在输入里的节点数
 * - 结果按「各系列封面 created_at」倒序（最近编辑的系列排最前）
 */
export function groupBySeries(videos: Video[]): SeriesGroupItem[] {
  const groups = new Map<string, Video[]>();
  for (const v of videos) {
    const key = seriesKey(v);
    const arr = groups.get(key);
    if (arr) arr.push(v);
    else groups.set(key, [v]);
  }

  const items: SeriesGroupItem[] = [];
  for (const [seriesId, arr] of groups) {
    // 封面 = created_at 最大的节点（并列时按 id 稳定排序，保证确定性）
    const cover = arr.reduce((best, cur) => {
      const c = cur.created_at.localeCompare(best.created_at);
      if (c > 0) return cur;
      if (c === 0 && cur.id > best.id) return cur;
      return best;
    });
    items.push({ cover, count: arr.length, seriesId });
  }

  // 系列间按封面时间倒序：刚续写完的系列冒到最前
  items.sort((a, b) => {
    const c = b.cover.created_at.localeCompare(a.cover.created_at);
    return c !== 0 ? c : b.seriesId.localeCompare(a.seriesId);
  });

  return items;
}
