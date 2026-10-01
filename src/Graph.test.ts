// @vitest-environment jsdom
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import Graph from './Graph.vue';
import type { Cell } from './types';

const cell = (kind: string, color = 0): Cell => ({ kind, color, secondary: color });

describe('Git 圖譜節點連線', () => {
  it('第一筆 commit 從圓點向下畫線，不向上多畫半條線', () => {
    const graph = mount(Graph, {
      props: { cells: [cell('commit')], lanes: 0, connector: false },
    });
    expect(graph.get('path').attributes('d')).toBe('M18 26 V52');
    expect(graph.get('circle').attributes('cy')).toBe('26');
  });

  it.each(['empty', 'horizontal', 'mergeRight', 'mergeLeft', 'teeUp'])(
    '上方 %s 沒有向下連線時，新分支節點不留餘線',
    (kind) => {
      const graph = mount(Graph, {
        props: {
          cells: [cell('pipe'), cell('empty'), cell('commit', 1)],
          previousCells: [cell('pipe'), cell('empty'), cell(kind)],
          lanes: 1,
          connector: false,
        },
      });
      expect(graph.findAll('path')[2].attributes('d')).toBe('M38 26 V52');
      expect(graph.findAll('path')[0].attributes('d')).toBe('M18 0 V52');
    },
  );

  it.each(['pipe', 'commit', 'branchRight', 'branchLeft', 'teeRight', 'teeLeft', 'cross'])(
    '上方 %s 有向下連線時，保留完整連接線',
    (kind) => {
      const graph = mount(Graph, {
        props: {
          cells: [cell('commit')],
          previousCells: [cell(kind)],
          lanes: 0,
          connector: false,
        },
      });
      expect(graph.get('path').attributes('d')).toBe('M18 0 V52');
    },
  );
});
