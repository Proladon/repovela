<script setup lang="ts">
import { FolderGit2, MoreHorizontal, Pin } from 'lucide-vue-next';
import type { Action, SavedProject } from './session';

const props = defineProps<{ project: SavedProject; active: string | null; menuOpen: boolean }>();
const emit = defineEmits<{
  action: [action: Action];
  toggleMenu: [];
  dismiss: [];
  rename: [];
  path: [];
}>();
function perform(action: Action) {
  emit('action', action);
  emit('dismiss');
}
function renameProject() {
  emit('rename');
  emit('dismiss');
}
function showPath() {
  emit('path');
  emit('dismiss');
}
</script>

<template>
  <div :class="`project-item ${project.path === active ? 'active' : ''}`">
    <button
      class="project-open"
      :title="project.path"
      @click="emit('action', { type: 'open', path: project.path })"
    >
      <FolderGit2 :size="17" /><span>{{ project.name }}</span
      ><Pin v-if="project.pinned" :size="11" />
    </button>
    <button
      class="project-more icon-button"
      :aria-label="`${project.name} 專案選單`"
      @click="emit('toggleMenu')"
    >
      <MoreHorizontal :size="15" />
    </button>
    <template v-if="menuOpen">
      <div class="dismiss" @click="emit('dismiss')" />
      <div class="project-menu popover">
        <button @click="perform({ type: 'pin', path: props.project.path })">
          {{ project.pinned ? '取消釘選' : '釘選專案' }}
        </button>
        <button @click="renameProject">{{ '重新命名' }}</button>
        <button @click="showPath">{{ '查看路徑' }}</button>
        <button class="minus" @click="perform({ type: 'remove', path: props.project.path })">
          {{ '從清單移除' }}
        </button>
      </div>
    </template>
  </div>
</template>
