// 详情页圆点树的「作者归属」计算：
// L1 —— 区分「我的续写」与「他人续写」（按 authorId）
// L2 —— 我的创作主路径：从 root 到「我最新的那一集」的链路，供高亮连线
import type { SeriesNode } from '@/api/videos';

/** 我在该系列里拥有的节点 id 集合（L1 上色用）。 */
export function myNodeIds(nodes: SeriesNode[], myId: string | null | undefined): Set<string> {
  const set = new Set<string>();
  if (!myId) return set;
  for (const n of nodes) if (n.authorId === myId) set.add(n.id);
  return set;
}

/**
 * 我的创作主路径节点 id 集合（L2 高亮用）：
 * 取「我拥有的、created_at 最新」的节点，沿 parentId 一路向上到 root，
 * 收集这条链上的所有节点 id。我没有任何节点时返回空集。
 */
export function myPathIds(nodes: SeriesNode[], myId: string | null | undefined): Set<string> {
  const path = new Set<string>();
  if (!myId) return path;

  const byId = new Map<string, SeriesNode>();
  for (const n of nodes) byId.set(n.id, n);

  // 我最新的节点 = 我拥有的里 created_at 最大（并列按 id 稳定）
  let latest: SeriesNode | null = null;
  for (const n of nodes) {
    if (n.authorId !== myId) continue;
    if (!latest) { latest = n; continue; }
    const c = n.createdAt.localeCompare(latest.createdAt);
    if (c > 0 || (c === 0 && n.id > latest.id)) latest = n;
  }
  if (!latest) return path;

  // 沿 parentId 向上收集，带环保护
  let cur: SeriesNode | undefined = latest;
  while (cur && !path.has(cur.id)) {
    path.add(cur.id);
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return path;
}
