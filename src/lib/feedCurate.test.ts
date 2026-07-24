import { describe, it, expect } from 'vitest';
import { dedupLatestPerAuthorPerSeries, seededShuffle, curateFeed } from './feedCurate';
import type { Video } from '@/api/types';

function v(partial: Partial<Video> & Pick<Video, 'id'>): Video {
  return {
    author_id: 'a1',
    parent_id: null,
    remix_kind: null,
    depth: 0,
    prompt: '',
    video_url: 'u',
    status: 'ready',
    visibility: 'public',
    created_at: '2024-01-01T00:00:00Z',
    ...partial,
    root_id: partial.root_id ?? partial.id,
  };
}

describe('dedupLatestPerAuthorPerSeries', () => {
  it('同系列同作者只留最新一集', () => {
    const out = dedupLatestPerAuthorPerSeries([
      v({ id: 'n1', root_id: 'r', author_id: 'a1', created_at: '2024-01-01T00:00:00Z' }),
      v({ id: 'n2', root_id: 'r', author_id: 'a1', created_at: '2024-01-03T00:00:00Z' }),
      v({ id: 'n3', root_id: 'r', author_id: 'a1', created_at: '2024-01-02T00:00:00Z' }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('n2');
  });

  it('同系列不同作者各留一条最新', () => {
    const out = dedupLatestPerAuthorPerSeries([
      v({ id: 'a-old', root_id: 'r', author_id: 'a1', created_at: '2024-01-01T00:00:00Z' }),
      v({ id: 'a-new', root_id: 'r', author_id: 'a1', created_at: '2024-01-05T00:00:00Z' }),
      v({ id: 'b-only', root_id: 'r', author_id: 'a2', created_at: '2024-01-02T00:00:00Z' }),
    ]);
    const ids = out.map((x) => x.id).sort();
    expect(ids).toEqual(['a-new', 'b-only']);
  });

  it('不同系列互不影响', () => {
    const out = dedupLatestPerAuthorPerSeries([
      v({ id: 's1', root_id: 'r1', author_id: 'a1' }),
      v({ id: 's2', root_id: 'r2', author_id: 'a1' }),
    ]);
    expect(out).toHaveLength(2);
  });

  it('created_at 并列时按 id 稳定选取', () => {
    const out = dedupLatestPerAuthorPerSeries([
      v({ id: 'aaa', root_id: 'r', author_id: 'a1', created_at: '2024-01-01T00:00:00Z' }),
      v({ id: 'zzz', root_id: 'r', author_id: 'a1', created_at: '2024-01-01T00:00:00Z' }),
    ]);
    expect(out[0].id).toBe('zzz');
  });
});

describe('seededShuffle', () => {
  it('同 seed 顺序可复现', () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8];
    expect(seededShuffle(items, 42)).toEqual(seededShuffle(items, 42));
  });

  it('不同 seed 通常不同顺序', () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    expect(seededShuffle(items, 1)).not.toEqual(seededShuffle(items, 2));
  });

  it('不修改入参，元素集合不变', () => {
    const items = [1, 2, 3, 4, 5];
    const copy = items.slice();
    const out = seededShuffle(items, 7);
    expect(items).toEqual(copy); // 原数组未变
    expect(out.slice().sort((a, b) => a - b)).toEqual(copy);
  });
});

describe('curateFeed', () => {
  it('先去重再打乱，同 seed 结果稳定', () => {
    const input = [
      v({ id: 'a-old', root_id: 'r', author_id: 'a1', created_at: '2024-01-01T00:00:00Z' }),
      v({ id: 'a-new', root_id: 'r', author_id: 'a1', created_at: '2024-01-05T00:00:00Z' }),
      v({ id: 'b', root_id: 'r', author_id: 'a2', created_at: '2024-01-02T00:00:00Z' }),
      v({ id: 'c', root_id: 'r2', author_id: 'a1', created_at: '2024-01-02T00:00:00Z' }),
    ];
    const out = curateFeed(input, 99);
    const ids = out.map((x) => x.id).sort();
    expect(ids).toEqual(['a-new', 'b', 'c']); // a-old 被去掉
    expect(curateFeed(input, 99)).toEqual(out); // 可复现
  });
});
