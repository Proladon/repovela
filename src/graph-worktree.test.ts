import { describe, expect, it } from 'vitest';
import { withWorktree, WORKTREE_COLOR } from './graph';
import type { Cell, Row } from './types';

const cell = (kind: string, color = 9, secondary = color): Cell => ({ kind, color, secondary });
const row = (cells: Cell[], isHead = false): Row => ({
  commit: {
    oid: isHead ? 'head' : 'other',
    shortId: '',
    author: '',
    email: '',
    date: '',
    message: '',
    fullMessage: '',
    parents: [],
  },
  branches: [],
  tags: [],
  isHead,
  cells,
});

describe('工作區圖譜', () => {
  it('工作區置頂並連至 checkout，保留其他分支', () => {
    const newer = row([cell('pipe'), cell('empty'), cell('commit', 1)]);
    const head = row([cell('commit'), cell('empty'), cell('pipe', 1)], true);
    const graph = withWorktree([newer, head], 1);
    expect(
      graph.rows.map((r) => (r.isWorktree ? 'worktree' : (r.commit?.oid ?? 'connector'))),
    ).toEqual(['worktree', 'other', 'connector', 'head']);
    expect(graph.rows[1].cells.map((c) => c.kind)).toEqual([
      'pipe',
      'empty',
      'commit',
      'empty',
      'pipe',
      'empty',
    ]);
    expect(graph.rows[0].cells[4]).toEqual(cell('commit', WORKTREE_COLOR));
    expect(graph.rows[1].cells[4]).toEqual(cell('pipe', WORKTREE_COLOR));
    expect(graph.rows[2].cells[0]).toEqual(cell('worktreeJoin', 9, WORKTREE_COLOR));
    expect(graph.rows[2].cells[1].color).toBe(WORKTREE_COLOR);
    expect(graph.rows[2].cells[4].color).toBe(WORKTREE_COLOR);
    expect(graph.rows[2].cells.map((c) => c.kind)).toEqual([
      'worktreeJoin',
      'horizontal',
      'cross',
      'horizontal',
      'mergeLeft',
      'empty',
    ]);
    expect(graph.rows[2].cells[2].secondary).toBe(1);
    expect(graph.maxLane).toBe(2);
  });

  it('工作區連線穿過中間的水平線，不破壞原有分支', () => {
    const graph = withWorktree(
      [row([cell('pipe'), cell('empty'), cell('horizontal', 1)]), row([cell('commit')], true)],
      1,
    );
    expect(graph.rows[0].cells[2].kind).toBe('commit');
    expect(graph.rows[1].cells[2]).toEqual(cell('cross', 1, WORKTREE_COLOR));
    expect(graph.rows[2].cells[2].kind).toBe('mergeLeft');
  });

  it('歷史中有大量其他分支時，工作區使用 HEAD 附近的空線', () => {
    const graph = withWorktree([row([cell('commit')]), row([cell('commit')], true)], 80);
    const worktree = graph.rows.find((item) => item.isWorktree)!;
    expect(worktree.cells.findIndex((item) => item.kind === 'commit')).toBe(2);
    expect(graph.rows[2].cells[2].kind).toBe('mergeLeft');
    expect(graph.maxLane).toBe(80);
  });

  it('HEAD 上方沒有連線時沿同一條線延伸', () => {
    const graph = withWorktree([row([cell('commit')], true)], 0);
    expect(graph.rows).toHaveLength(2);
    expect(graph.rows[0].isWorktree).toBe(true);
    expect(graph.rows[0].cells[0]).toEqual(cell('commit', WORKTREE_COLOR));
    expect(graph.maxLane).toBe(0);
  });

  it('歷史尚未載入 HEAD 或尚無 commit 時仍提供工作區', () => {
    expect(withWorktree([], 0).rows[0].isWorktree).toBe(true);
    expect(withWorktree([row([cell('commit')])], 0).rows[0].isWorktree).toBe(true);
  });
});
