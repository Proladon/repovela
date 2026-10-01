<script setup lang="ts">
import { computed } from 'vue';
import type { Cell } from './types';

const props = defineProps<{ cells: Cell[]; lanes: number; connector: boolean }>();
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
const graphColor = (index: number) => palette[index % palette.length];
const height = computed(() => (props.connector ? 18 : 52));
const mid = computed(() => height.value / 2);
const width = computed(() => (props.lanes + 1) * 20 + 16);
function segments(cell: Cell, x: number) {
  const h = height.value,
    m = mid.value;
  const top = `M${x} 0 V${h}`;
  switch (cell.kind) {
    case 'pipe':
    case 'commit':
      return top;
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
      <path :d="segments(cell, 18 + i * 10)" />
      <circle
        v-if="cell.kind === 'commit'"
        :cx="18 + i * 10"
        :cy="mid"
        r="4.3"
        :fill="graphColor(cell.color)"
        stroke="#15181e"
        stroke-width="2"
      />
    </g>
  </svg>
</template>
