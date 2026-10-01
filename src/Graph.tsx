import type { CSSProperties } from 'react';
import type { Cell } from './types';

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
export function Graph({
  cells,
  lanes,
  connector,
}: {
  cells: Cell[];
  lanes: number;
  connector: boolean;
}) {
  const height = connector ? 18 : 52;
  const mid = height / 2;
  const width = (lanes + 1) * 20 + 16;
  const segments = (cell: Cell, x: number) => {
    const top = `M${x} 0 V${height}`;
    switch (cell.kind) {
      case 'pipe':
        return top;
      case 'commit':
        return top;
      case 'horizontal':
        return `M${x - 5} ${mid} H${x + 5}`;
      case 'branchRight':
        return `M${x} ${height} V${mid + 3} Q${x} ${mid} ${x + 3} ${mid} H${x + 5}`;
      case 'branchLeft':
        return `M${x} ${height} V${mid + 3} Q${x} ${mid} ${x - 3} ${mid} H${x - 5}`;
      case 'mergeRight':
        return `M${x} 0 V${mid - 3} Q${x} ${mid} ${x + 3} ${mid} H${x + 5}`;
      case 'mergeLeft':
        return `M${x} 0 V${mid - 3} Q${x} ${mid} ${x - 3} ${mid} H${x - 5}`;
      case 'teeRight':
        return `${top} M${x} ${mid} H${x + 5}`;
      case 'teeLeft':
        return `${top} M${x} ${mid} H${x - 5}`;
      case 'teeUp':
        return `M${x - 5} ${mid} H${x + 5} M${x} 0 V${mid}`;
      case 'cross':
        return `M${x - 5} ${mid} H${x + 5}`;
      default:
        return '';
    }
  };
  return (
    <svg
      aria-hidden="true"
      width={width}
      height={height}
      className="graph-svg"
      style={{ '--graph-width': `${width}px` } as CSSProperties}
    >
      {cells.map((cell, i) => {
        // keifu interleaves lane cells with horizontal connector cells.
        const x = 18 + i * 10;
        return (
          <g key={i} stroke={graphColor(cell.color)} strokeWidth="1.8" fill="none">
            {cell.kind === 'cross' && (
              <path d={`M${x} 0 V${height}`} stroke={graphColor(cell.secondary)} />
            )}
            <path d={segments(cell, x)} />
            {cell.kind === 'commit' && (
              <circle
                cx={x}
                cy={mid}
                r="4.3"
                fill={graphColor(cell.color)}
                stroke="#15181e"
                strokeWidth="2"
              />
            )}
          </g>
        );
      })}
    </svg>
  );
}
