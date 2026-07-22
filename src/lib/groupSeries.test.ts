import { describe, it, expect } from 'vitest';
import { groupBySeries } from './groupSeries';
import type { Video } from '@/api/types';

function v(partial: Partial<Video> & Pick<Video, 'id'>): Video {
  return {
    author_id: 'me',
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

describe('groupBySeries', () => {
  it('单集视频各自成组，count=1', () => {
    const out = groupBySeries([v({ id: 'a' }), v({ id: 'b' })]);
    expect(out).toHaveLength(2);
    expect(out.every((g) => g.count === 1)).toBe(true);
  });

  it('同 root_id 的续写折叠为一格', () => {
    const out = groupBySeries([
      v({ id: 'r', root_id: 'r', depth: 0, created_at: '2024-01-01T00:00:00Z' }),
      v({ id: 'c1', root_id: 'r', parent_id: 'r', depth: 1, created_at: '2024-01-02T00:00:00Z' }),
      v({ id: 'c2', root_id: 'r', parent_id: 'c1', depth: 2, created_at: '2024-01-03T00:00:00Z' }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].count).toBe(3);
  });

  it('封面取系列内 created_at 最新的叶子', () => {
    const out = groupBySeries([
      v({ id: 'r', root_id: 'r', created_at: '2024-01-01T00:00:00Z' }),
      v({ id: 'latest', root_id: 'r', created_at: '2024-01-05T00:00:00Z' }),
      v({ id: 'mid', root_id: 'r', created_at: '2024-01-03T00:00:00Z' }),
    ]);
    expect(out[0].cover.id).toBe('latest');
  });

  it('多分支时仍取全系列最新叶子', () => {
    const out = groupBySeries([
      v({ id: 'r', root_id: 'r', depth: 0, created_at: '2024-01-01T00:00:00Z' }),
      v({ id: 'branchA', root_id: 'r', parent_id: 'r', depth: 1, created_at: '2024-01-02T00:00:00Z' }),
      v({ id: 'branchB', root_id: 'r', parent_id: 'r', depth: 1, created_at: '2024-01-04T00:00:00Z' }),
    ]);
    expect(out[0].cover.id).toBe('branchB');
  });

  it('系列间按封面时间倒序（最近编辑排前）', () => {
    const out = groupBySeries([
      v({ id: 'old', root_id: 'old', created_at: '2024-01-01T00:00:00Z' }),
      v({ id: 'newRoot', root_id: 'new', created_at: '2024-01-02T00:00:00Z' }),
      v({ id: 'newLeaf', root_id: 'new', created_at: '2024-01-09T00:00:00Z' }),
    ]);
    expect(out[0].seriesId).toBe('new');
    expect(out[1].seriesId).toBe('old');
  });

  it('created_at 并列时按 id 稳定选封面', () => {
    const out = groupBySeries([
      v({ id: 'aaa', root_id: 'r', created_at: '2024-01-01T00:00:00Z' }),
      v({ id: 'zzz', root_id: 'r', created_at: '2024-01-01T00:00:00Z' }),
    ]);
    expect(out[0].cover.id).toBe('zzz');
  });

  it('root_id 缺失时回退到自身 id，独立成组', () => {
    const out = groupBySeries([v({ id: 'x', root_id: '' as unknown as string })]);
    expect(out).toHaveLength(1);
    expect(out[0].seriesId).toBe('x');
  });
});
