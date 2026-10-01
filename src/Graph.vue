<script setup lang="ts">
import { computed } from 'vue';
import type { Cell } from './types';
import { graphColor } from './graph';

const props = defineProps<{
  cells: Cell[];
  previousCells?: Cell[];
  lanes: number;
  connector: boolean;
  isHead?: boolean;
  rowHeight?: number;
  connectorHeight?: number;
}>();
const height = computed(() =>
  props.connector ? (props.connectorHeight ?? 18) : (props.rowHeight ?? 52),
);
const mid = computed(() => height.value / 2);
const width = computed(() => (props.lanes + 1) * 20 + 16);
function segments(cell: Cell, x: number, index: number) {
  const h = height.value,
    m = mid.value;
  const top = `M${x} 0 V${h}`;
  switch (cell.kind) {
    case 'pipe':
      return top;
    case 'commit': {
      // Only extend upward when the previous row has a downward edge in this lane.
      const above = props.previousCells?.[index]?.kind;
      const connected =
        above &&
        ['pipe', 'commit', 'branchRight', 'branchLeft', 'teeRight', 'teeLeft', 'cross'].includes(
          above,
        );
      return `M${x} ${connected ? 0 : m} V${h}`;
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
</script>

<template>
  <svg
    aria-hidden="true"
    :width="width"
    :height="height"
    class="graph-svg"
    :style="{ '--graph-width': `${width}px` }"
  >
    <g
      v-for="(cell, i) in cells"
      :key="i"
      :stroke="graphColor(cell.color)"
      stroke-width="1.8"
      fill="none"
    >
      <path
        v-if="cell.kind === 'cross'"
        :d="`M${18 + i * 10} 0 V${height}`"
        :stroke="graphColor(cell.secondary)"
      />
      <path :d="segments(cell, 18 + i * 10, i)" />
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
        :class="{ 'graph-head-node': isHead }"
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
