<script setup lang="ts">
import { computed } from 'vue';
import type { Cell } from './types';
import {
  connectsFromAbove,
  graphColor,
  WORKTREE_COLOR,
  type GraphGlowRow,
  type HighlightedCell,
} from './graph';

const props = defineProps<{
  cells: Cell[];
  previousCells?: Cell[];
  highlightedCells?: HighlightedCell[];
  previousGlow?: GraphGlowRow;
  nextGlow?: GraphGlowRow;
  lanes: number;
  connector: boolean;
  isHead?: boolean;
  stopAtNode?: boolean;
  worktreeParent?: boolean;
  rowHeight?: number;
  connectorHeight?: number;
}>();
const height = computed(() =>
  props.connector ? (props.connectorHeight ?? 18) : (props.rowHeight ?? 32),
);
const mid = computed(() => height.value / 2);
const width = computed(() => (props.lanes + 1) * 20 + 16);
function segments(
  cell: Cell,
  x: number,
  index: number,
  h = height.value,
  previousCells = props.previousCells,
  worktreeParent = props.worktreeParent,
) {
  const m = h / 2;
  const top = `M${x} 0 V${h}`;
  switch (cell.kind) {
    case 'pipe':
      return top;
    case 'commit': {
      // Only extend upward when the previous row has a downward edge in this lane.
      const connected = connectsFromAbove(previousCells?.[index]);
      return `M${x} ${connected && !worktreeParent ? 0 : m} V${props.stopAtNode ? m : h}`;
    }
    case 'horizontal':
      return `M${x - 5} ${m} H${x + 5}`;
    case 'branchRight':
      return `M${x} ${h} V${m + 3} Q${x} ${m} ${x + 3} ${m} H${x + 5}`;
    case 'branchLeft':
      return `M${x} ${h} V${m + 3} Q${x} ${m} ${x - 3} ${m} H${x - 5}`;
    case 'mergeRight':
      return `M${x} 0 V${m - 3} Q${x} ${m} ${x + 3} ${m} H${x + 5}`;
    case 'mergeLeft':
      return `M${x} 0 V${m - 3} Q${x} ${m} ${x - 3} ${m} H${x - 5}`;
    case 'worktreeJoin':
      return top;
    case 'worktreeBranch':
      return `M${x} ${m} V${h}`;
    case 'teeRight':
      return `${top} M${x} ${m} H${x + 5}`;
    case 'teeLeft':
      return `${top} M${x} ${m} H${x - 5}`;
    case 'teeUp':
      return `M${x - 5} ${m} H${x + 5} M${x} 0 V${m}`;
    case 'cross':
      return `M${x - 5} ${m} H${x + 5}`;
    default:
      return '';
  }
}

const glowSegments = computed(() => {
  // Blur adjacent rows together before the SVG viewport clips the result.
  // This keeps the glow uniform at row boundaries and between horizontal cells.
  const rows = [
    { row: props.previousGlow, offset: -(props.previousGlow?.height ?? 0) },
    {
      row: {
        cells: props.cells,
        previousCells: props.previousCells,
        highlightedCells: props.highlightedCells ?? [],
        height: height.value,
        worktreeParent: props.worktreeParent,
      },
      offset: 0,
    },
    { row: props.nextGlow, offset: height.value },
  ];
  return rows.flatMap(
    ({ row, offset }) =>
      row?.cells.flatMap((cell, i) => {
        const paths: { d: string; color: number; offset: number }[] = [];
        const highlighted = row.highlightedCells[i];
        const x = 18 + i * 10;
        if (highlighted?.primary) {
          paths.push({
            d: segments(cell, x, i, row.height, row.previousCells, row.worktreeParent ?? false),
            color: cell.color,
            offset,
          });
        }
        if (
          highlighted?.secondary &&
          ['cross', 'worktreeJoin', 'worktreeBranch'].includes(cell.kind)
        ) {
          const d =
            cell.kind === 'cross' ? `M${x} 0 V${row.height}` : `M${x} ${row.height / 2} H${x + 5}`;
          paths.push({ d, color: cell.secondary, offset });
        }
        return paths;
      }) ?? [],
  );
});
</script>

<template>
  <svg
    aria-hidden="true"
    :width="width"
    :height="height"
    class="graph-svg"
    :style="{ '--graph-width': `${width}px` }"
  >
    <g v-if="glowSegments.length" class="graph-glow" fill="none" stroke-width="6">
      <path
        v-for="(segment, i) in glowSegments"
        :key="i"
        :d="segment.d"
        :stroke="graphColor(segment.color)"
        :transform="`translate(0 ${segment.offset})`"
      />
    </g>
    <g
      v-for="(cell, i) in cells"
      :key="i"
      class="graph-stroke"
      :stroke="graphColor(cell.color)"
      :style="{ color: graphColor(cell.color) }"
      stroke-width="1.8"
      fill="none"
    >
      <path
        v-if="['cross', 'worktreeJoin', 'worktreeBranch'].includes(cell.kind)"
        :class="{ 'graph-line-highlight': highlightedCells?.[i]?.secondary }"
        :d="
          cell.kind === 'cross'
            ? `M${18 + i * 10} 0 V${height}`
            : `M${18 + i * 10} ${mid} H${23 + i * 10}`
        "
        :stroke="graphColor(cell.secondary)"
        :style="{ color: graphColor(cell.secondary) }"
      />
      <path
        :class="{ 'graph-line-highlight': highlightedCells?.[i]?.primary }"
        :d="segments(cell, 18 + i * 10, i)"
      />
      <path
        v-if="cell.kind === 'commit' && worktreeParent"
        :d="`M${18 + i * 10} 0 V${mid}`"
        :stroke="graphColor(WORKTREE_COLOR)"
      />
      <circle
        v-if="cell.kind === 'commit' && isHead"
        class="graph-head-ring"
        :cx="18 + i * 10"
        :cy="mid"
        r="8.5"
        :stroke="graphColor(cell.color)"
        stroke-opacity="0.55"
        stroke-width="2"
      />
      <circle
        v-if="cell.kind === 'commit'"
        :class="{
          'graph-head-node': isHead,
          'graph-node-highlight': highlightedCells?.[i]?.primary,
        }"
        :cx="18 + i * 10"
        :cy="mid"
        :r="isHead ? 5.5 : 4.3"
        :fill="graphColor(cell.color)"
        :stroke="isHead ? '#f0eaff' : '#15181e'"
        stroke-width="2"
      />
    </g>
  </svg>
</template>
