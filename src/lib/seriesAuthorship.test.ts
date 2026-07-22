import { describe, it, expect } from 'vitest';
import { myNodeIds, myPathIds } from './seriesAuthorship';
import type { SeriesNode } from '@/api/videos';

function n(id: string, parentId: string | null, authorId: string | null, createdAt: string, depth = 0): SeriesNode {
  return { id, parentId, authorId, depth, prompt: null, createdAt };
}

// 系列：root(me) → a(me) → b(other) → c(me)
const tree: SeriesNode[] = [
  n('root', null, 'me', '2024-01-01T00:00:00Z', 0),
  n('a', 'root', 'me', '2024-01-02T00:00:00Z', 1),
  n('b', 'a', 'other', '2024-01-03T00:00:00Z', 2),
  n('c', 'b', 'me', '2024-01-04T00:00:00Z', 3),
];

describe('myNodeIds', () => {
  it('收集我拥有的所有节点', () => {
    const ids = myNodeIds(tree, 'me');
    expect([...ids].sort()).toEqual(['a', 'c', 'root']);
  });
  it('无用户时返回空集', () => {
    expect(myNodeIds(tree, null).size).toBe(0);
  });
  it('我没有任何节点时返回空集', () => {
    expect(myNodeIds(tree, 'stranger').size).toBe(0);
  });
});

describe('myPathIds', () => {
  it('从我最新节点回溯到 root，含中间他人节点', () => {
    // c(me) 最新 → c → b(other) → a → root 全在路径上
    const ids = myPathIds(tree, 'me');
    expect([...ids].sort()).toEqual(['a', 'b', 'c', 'root']);
  });

  it('我最新节点在中途时，路径只到该节点', () => {
    // 若我最新是 a：路径 a → root
    const partial: SeriesNode[] = [
      n('root', null, 'me', '2024-01-01T00:00:00Z', 0),
      n('a', 'root', 'me', '2024-01-02T00:00:00Z', 1),
      n('b', 'a', 'other', '2024-01-03T00:00:00Z', 2),
    ];
    const ids = myPathIds(partial, 'me');
    expect([...ids].sort()).toEqual(['a', 'root']);
  });

  it('多分支时取我最新的叶子那条路径', () => {
    const branched: SeriesNode[] = [
      n('root', null, 'me', '2024-01-01T00:00:00Z', 0),
      n('x', 'root', 'me', '2024-01-02T00:00:00Z', 1),
      n('y', 'root', 'me', '2024-01-05T00:00:00Z', 1), // 更新，选这条
    ];
    const ids = myPathIds(branched, 'me');
    expect([...ids].sort()).toEqual(['root', 'y']);
  });

  it('我没有任何节点时返回空集', () => {
    expect(myPathIds(tree, 'stranger').size).toBe(0);
  });

  it('无用户时返回空集', () => {
    expect(myPathIds(tree, null).size).toBe(0);
  });
});
