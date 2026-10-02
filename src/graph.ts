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
}

const downwardKinds = new Set([
  'pipe',
  'commit',
  'branchRight',
  'branchLeft',
  'teeRight',
  'teeLeft',
  'cross',
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
    if (part === 'secondary') return cell.kind === 'cross' ? ['up', 'down'] : [];
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
