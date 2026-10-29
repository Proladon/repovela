import type { Cell, Row } from './types';

const palette = [
  '#55c4d0',
  '#78c999',
  '#bb91e8',
  '#e3c378',
  '#df8888',
  '#7bcedd',
  '#a0d38a',
  '#d79ada',
  '#e6da99',
  '#87a9f6',
  '#f0a491',
  '#888d9a',
];

export const WORKTREE_COLOR = 11;

export const graphColor = (index: number) => palette[index % palette.length];

export interface HighlightedCell {
  primary?: boolean;
  secondary?: boolean;
}

export interface GraphGlowRow {
  cells: Cell[];
  previousCells?: Cell[];
  highlightedCells: HighlightedCell[];
  height: number;
  worktreeParent?: boolean;
}

const downwardKinds = new Set([
  'pipe',
  'commit',
  'branchRight',
  'branchLeft',
  'teeRight',
  'teeLeft',
  'cross',
  'worktreeJoin',
  'worktreeBranch',
]);

export const connectsFromAbove = (previous?: Cell) =>
  !!previous && downwardKinds.has(previous.kind);

type Direction = 'up' | 'down' | 'left' | 'right';
const ports: Record<string, Direction[]> = {
  pipe: ['up', 'down'],
  horizontal: ['left', 'right'],
  branchRight: ['down', 'right'],
  branchLeft: ['down', 'left'],
  mergeRight: ['up', 'right'],
  mergeLeft: ['up', 'left'],
  teeRight: ['up', 'down', 'right'],
  teeLeft: ['up', 'down', 'left'],
  teeUp: ['up', 'left', 'right'],
  cross: ['left', 'right'],
  worktreeJoin: ['up', 'down'],
  worktreeBranch: ['down'],
};
const neighbors: Record<Direction, [number, number, Direction]> = {
  up: [-1, 0, 'down'],
  down: [1, 0, 'up'],
  left: [0, -1, 'right'],
  right: [0, 1, 'left'],
};

// Follow the connected line, rather than every use of its palette color or lane.
// At crossings the horizontal and vertical strokes remain separate segments.
export function selectedGraphLine(rows: Row[], oid?: string | null): HighlightedCell[][] {
  if (!oid || oid === 'worktree') return [];
  const startRow = rows.findIndex((row) => row.commit?.oid === oid);
  const startColumn = rows[startRow]?.cells.findIndex((cell) => cell.kind === 'commit') ?? -1;
  if (startColumn < 0) return [];

  const highlighted = rows.map((row) => row.cells.map((): HighlightedCell => ({})));
  type Segment = { row: number; column: number; part: keyof HighlightedCell };
  const pending: Segment[] = [{ row: startRow, column: startColumn, part: 'primary' }];
  const segmentPorts = ({ row, column, part }: Segment): Direction[] => {
    const cell = rows[row].cells[column];
    if (part === 'secondary')
      return cell.kind === 'cross'
        ? ['up', 'down']
        : ['worktreeJoin', 'worktreeBranch'].includes(cell.kind)
          ? ['right']
          : [];
    if (cell.kind === 'commit') {
      return connectsFromAbove(rows[row - 1]?.cells[column])
        ? ['up', 'down', 'left', 'right']
        : ['down', 'left', 'right'];
    }
    return ports[cell.kind] ?? [];
  };

  while (pending.length) {
    const current = pending.pop()!;
    const { row, column, part } = current;
    if (highlighted[row][column][part]) continue;
    highlighted[row][column][part] = true;
    const color =
      part === 'primary' ? rows[row].cells[column].color : rows[row].cells[column].secondary;
    for (const direction of segmentPorts(current)) {
      const [dy, dx, opposite] = neighbors[direction];
      const nextRow = row + dy,
        nextColumn = column + dx;
      const cell = rows[nextRow]?.cells[nextColumn];
      if (!cell) continue;
      for (const nextPart of ['primary', 'secondary'] as const) {
        const next = { row: nextRow, column: nextColumn, part: nextPart };
        const nextColor = nextPart === 'primary' ? cell.color : cell.secondary;
        if (nextColor === color && segmentPorts(next).includes(opposite)) pending.push(next);
      }
    }
  }
  return highlighted;
}

// Keep the working tree at the top and connect it to the checked-out commit.
export function withWorktree(rows: Row[], maxLane: number): { rows: Row[]; maxLane: number } {
  const headIndex = rows.findIndex((row) => row.isHead && row.commit);
  const head = rows[headIndex];
  const headColumn = head?.cells.findIndex((cell) => cell.kind === 'commit') ?? -1;
  const empty = (): Cell => ({ kind: 'empty', color: 0, secondary: 0 });
  const cell = (kind: string, color: number, secondary = color): Cell => ({
    kind,
    color,
    secondary,
  });
  const color = WORKTREE_COLOR;
  let worktreeColumn = Math.max(0, headColumn);
  if (headColumn >= 0) {
    // A horizontal line can be crossed; all other occupied cells need their
    // own lane so that no existing branch is overwritten.
    while (
      rows.slice(0, headIndex).some((row) => {
        const kind = row.cells[worktreeColumn]?.kind;
        return kind && kind !== 'empty' && kind !== 'horizontal';
      })
    )
      worktreeColumn += 2;
  }
  const resultMaxLane = Math.max(maxLane, worktreeColumn / 2);
  const size = (resultMaxLane + 1) * 2;
  const worktreeCells = Array.from({ length: size }, empty);
  worktreeCells[worktreeColumn] = cell('commit', color);
  const worktree: Row = {
    commit: null,
    branches: [],
    tags: [],
    isHead: false,
    isWorktree: true,
    cells: worktreeCells,
  };
  if (headColumn < 0) return { rows: [worktree, ...rows], maxLane: resultMaxLane };

  const beforeHead = rows.slice(0, headIndex).map((row) => {
    const cells = row.cells.slice();
    while (cells.length < size) cells.push(empty());
    const existing = cells[worktreeColumn];
    cells[worktreeColumn] =
      existing.kind === 'horizontal' ? cell('cross', existing.color, color) : cell('pipe', color);
    return { ...row, cells };
  });
  if (worktreeColumn === headColumn) {
    return { rows: [worktree, ...beforeHead, ...rows.slice(headIndex)], maxLane: resultMaxLane };
  }

  const previous = beforeHead.at(-1);
  const connector = Array.from({ length: size }, (_, i) => {
    const c = previous?.cells[i];
    return c && connectsFromAbove(c)
      ? cell('pipe', c.kind === 'cross' ? c.secondary : c.color)
      : empty();
  });
  connector[headColumn] = cell(
    connectsFromAbove(previous?.cells[headColumn]) ? 'worktreeJoin' : 'worktreeBranch',
    head.cells[headColumn].color,
    color,
  );
  for (let i = headColumn + 1; i < worktreeColumn; i++) {
    connector[i] =
      connector[i].kind === 'pipe'
        ? cell('cross', color, connector[i].color)
        : cell('horizontal', color);
  }
  connector[worktreeColumn] = cell('mergeLeft', color);
  const connectorRow: Row = {
    commit: null,
    branches: [],
    tags: [],
    isHead: false,
    cells: connector,
  };
  return {
    rows: [worktree, ...beforeHead, connectorRow, ...rows.slice(headIndex)],
    maxLane: resultMaxLane,
  };
}
