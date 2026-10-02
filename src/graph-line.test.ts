import { describe, expect, it } from 'vitest';
import { selectedGraphLine } from './graph';
import type { Cell, Commit, Row } from './types';

const cell = (kind: string, color = 0, secondary = color): Cell => ({ kind, color, secondary });
const row = (cells: Cell[], oid?: string): Row => ({
  cells,
  commit: oid ? ({ oid } as Commit) : null,
  branches: [],
  tags: [],
  isHead: false,
});

describe('選取 commit 的整條圖譜線', () => {
  it('從中間 commit 向上、向下延伸，不標亮同色但已斷開或其他 lane 的線', () => {
    const rows = [
      row([cell('commit'), cell('empty'), cell('pipe')], 'tip'),
      row([cell('commit'), cell('empty'), cell('pipe')], 'selected'),
      row([cell('pipe'), cell('empty'), cell('pipe')]),
      row([cell('empty')]),
      row([cell('commit')], 'reused'),
    ];
    const highlights = selectedGraphLine(rows, 'selected');
    expect(highlights.map((cells) => !!cells[0].primary)).toEqual([true, true, true, false, false]);
    expect(highlights.slice(0, 3).every((cells) => !cells[2].primary)).toBe(true);
  });

  it('沿轉彎、水平線和 connector row 延伸到另一個 lane', () => {
    const rows = [
      row([cell('empty'), cell('empty'), cell('commit')], 'selected'),
      row([cell('branchRight'), cell('horizontal'), cell('mergeLeft')]),
      row([cell('commit')], 'base'),
    ];
    const highlights = selectedGraphLine(rows, 'selected');
    expect(highlights[1]).toEqual([{ primary: true }, { primary: true }, { primary: true }]);
    expect(highlights[2][0].primary).toBe(true);
  });

  it.each(['horizontal', 'vertical'])('交叉線只標亮所屬的 %s 線段，即使兩者同色', (direction) => {
    const rows = [
      row([cell('empty'), cell('empty'), cell('commit')], 'vertical'),
      row(
        [cell('commit'), cell('horizontal'), cell('cross'), cell('horizontal'), cell('mergeLeft')],
        'horizontal',
      ),
      row([cell('commit'), cell('empty'), cell('commit')], 'below'),
    ];
    const highlights = selectedGraphLine(rows, direction);
    expect(highlights[1][2]).toEqual(
      direction === 'horizontal' ? { primary: true } : { secondary: true },
    );
    expect(!!highlights[2][2].primary).toBe(direction === 'vertical');
    expect(!!highlights[1][0].primary).toBe(direction === 'horizontal');
  });

  it('沒有選取 commit、選取工作目錄或找不到節點時不標亮', () => {
    const rows = [row([cell('commit')], 'selected')];
    for (const oid of [undefined, null, 'worktree', 'missing']) {
      expect(selectedGraphLine(rows, oid)).toEqual([]);
    }
  });
});
