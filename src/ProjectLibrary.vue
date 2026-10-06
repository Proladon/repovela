<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import Draggable from 'vuedraggable';
import {
  ChevronDown,
  ChevronRight,
  Folder,
  FolderOpen,
  MoreHorizontal,
  Pencil,
  Pin,
  Plus,
  Trash2,
  X,
} from 'lucide-vue-next';
import ProjectItem from './ProjectItem.vue';
import { useContextMenu } from './contextMenu';
import type { Action, ProjectGroup, SavedProject, Session } from './session';

const props = defineProps<{ session: Session; query: string; menuPath: string | null }>();
const emit = defineEmits<{
  action: [action: Action];
  toggleMenu: [path: string];
  dismiss: [];
  rename: [project: SavedProject];
  path: [path: string];
}>();
const root = ref<HTMLElement | null>(null);
const groupInput = ref<HTMLInputElement | null>(null);
const editing = ref<{ id: string | null; name: string } | null>(null);
const dragging = ref(false);
const draggingGroup = ref(false);
const contextMenu = useContextMenu();
const searchFolded = ref(new Set<string>());
const query = computed(() => props.query.trim().toLowerCase());
watch(query, () => {
  searchFolded.value = new Set();
  emit('dismiss');
});
const matches = (project: SavedProject) =>
  `${project.name} ${project.path}`.toLowerCase().includes(query.value);
const members = (id: string) => props.session.projects.filter((project) => project.groupId === id);
const expanded = (group: ProjectGroup) =>
  query.value ? !searchFolded.value.has(group.id) : !group.collapsed;
interface Section {
  key: string;
  name: string;
  groupId: string | null;
  pinned?: boolean;
  group?: ProjectGroup;
  projects: SavedProject[];
  count: number;
  expanded: boolean;
}
const sections = computed<Section[]>(() => {
  const result: Section[] = [];
  if (props.session.projects.some((project) => project.pinned)) {
    const projects = props.session.projects.filter(
      (project) => !project.groupId && project.pinned && matches(project),
    );
    result.push({
      key: 'pinned',
      name: '已釘選',
      groupId: null,
      pinned: true,
      projects,
      count: projects.length,
      expanded: true,
    });
  }
  for (const group of props.session.groups) {
    const all = members(group.id);
    const nameMatches = group.name.toLowerCase().includes(query.value);
    const visible = all.filter((project) => nameMatches || matches(project));
    if (query.value && !nameMatches && !visible.length && !dragging.value) continue;
    result.push({
      key: `group:${group.id}`,
      name: group.name,
      groupId: group.id,
      group,
      projects: expanded(group) ? visible : [],
      count: all.length,
      expanded: expanded(group),
    });
  }
  const projects = props.session.projects.filter(
    (project) => !project.groupId && !project.pinned && matches(project),
  );
  result.push({
    key: 'ungrouped',
    name: props.session.groups.length ? '未分組' : '專案',
    groupId: null,
    pinned: false,
    projects,
    count: projects.length,
    expanded: true,
  });
  return result;
});
const duplicateName = computed(
  () =>
    !!editing.value &&
    props.session.groups.some(
      (group) =>
        group.id !== editing.value!.id &&
        group.name.toLowerCase() === editing.value!.name.trim().toLowerCase(),
    ),
);
async function editGroup(group?: ProjectGroup) {
  editing.value = { id: group?.id ?? null, name: group?.name ?? '' };
  emit('dismiss');
  contextMenu.close();
  await nextTick();
  groupInput.value?.focus();
  groupInput.value?.select();
}
async function saveGroup() {
  if (!editing.value?.name.trim() || duplicateName.value) return;
  const id = editing.value.id ?? crypto.randomUUID();
  emit('action', {
    type: editing.value.id ? 'renameGroup' : 'createGroup',
    id,
    name: editing.value.name,
  });
  editing.value = null;
  await nextTick();
  Array.from(root.value?.querySelectorAll<HTMLElement>('[data-group-id]') ?? [])
    .find((element) => element.dataset.groupId === id)
    ?.querySelector<HTMLElement>('.group-toggle')
    ?.focus({ preventScroll: true });
}
function toggleGroup(group: ProjectGroup) {
  if (!query.value) {
    emit('action', { type: 'toggleGroup', id: group.id });
    return;
  }
  const folded = new Set(searchFolded.value);
  if (folded.has(group.id)) folded.delete(group.id);
  else folded.add(group.id);
  searchFolded.value = folded;
}
function groupMenu(event: MouseEvent, group: ProjectGroup) {
  emit('dismiss');
  contextMenu.open(event, [
    { label: '重新命名群組', icon: Pencil, run: () => editGroup(group) },
    {
      label: '移除群組（保留專案）',
      icon: Trash2,
      run: () => emit('action', { type: 'removeGroup', id: group.id }),
    },
  ]);
}
interface DragChange {
  added?: { element: SavedProject; newIndex: number };
  moved?: { element: SavedProject; oldIndex: number; newIndex: number };
}
function change(section: Section, event: DragChange) {
  if (event.added) {
    emit('action', {
      type: 'moveProject',
      path: event.added.element.path,
      groupId: section.groupId,
      beforePath: section.projects[event.added.newIndex]?.path,
    });
  } else if (event.moved) {
    const projects = [...section.projects];
    projects.splice(event.moved.oldIndex, 1);
    projects.splice(event.moved.newIndex, 0, event.moved.element);
    emit('action', { type: 'reorder', paths: projects.map((project) => project.path) });
  }
}
function allowMove(event: { to: HTMLElement; draggedContext: { element: SavedProject } }) {
  return (
    !!event.to.dataset.groupId ||
    String(event.draggedContext.element.pinned) === event.to.dataset.pinned
  );
}
function changeGroups(event: { moved?: { element: Section; oldIndex: number; newIndex: number } }) {
  if (!event.moved) return;
  const ordered = [...sections.value];
  ordered.splice(event.moved.oldIndex, 1);
  ordered.splice(event.moved.newIndex, 0, event.moved.element);
  emit('action', {
    type: 'reorderGroups',
    ids: ordered.flatMap((section) => (section.group ? [section.group.id] : [])),
  });
}
function allowGroupMove(event: { relatedContext: { element?: Section } }) {
  return !!event.relatedContext.element?.group;
}
const dragOptions = {
  group: 'repovela-projects',
  handle: '.project-open',
  animation: 150,
  forceFallback: true,
  fallbackOnBody: true,
  fallbackTolerance: 5,
  ghostClass: 'project-ghost',
  dragClass: 'project-dragging',
  emptyInsertThreshold: 24,
};
function startDrag() {
  dragging.value = true;
  emit('dismiss');
  contextMenu.close();
}
function startGroupDrag() {
  draggingGroup.value = true;
  emit('dismiss');
  contextMenu.close();
}
</script>

<template>
  <div ref="root" class="project-library" :class="{ 'library-dragging': dragging }">
    <div class="library-heading">
      <span>專案庫</span>
      <button class="icon-button" title="建立群組" aria-label="建立群組" @click="editGroup()">
        <Plus :size="15" />
      </button>
    </div>
    <form
      v-if="editing"
      class="group-editor"
      @submit.prevent="saveGroup"
      @keydown.esc.stop.prevent="editing = null"
    >
      <label for="project-group-name">{{ editing.id ? '重新命名群組' : '建立群組' }}</label>
      <input
        id="project-group-name"
        ref="groupInput"
        v-model="editing.name"
        aria-label="群組名稱"
        maxlength="80"
        placeholder="群組名稱"
      />
      <p v-if="duplicateName" class="minus">已有同名群組。</p>
      <div>
        <button class="soft-button" type="submit" :disabled="!editing.name.trim() || duplicateName">
          {{ editing.id ? '儲存群組名稱' : '建立' }}</button
        ><button
          type="button"
          class="icon-button"
          aria-label="取消編輯群組"
          @click="editing = null"
        >
          <X :size="14" />
        </button>
      </div>
    </form>
    <Draggable
      :model-value="sections"
      item-key="key"
      class="project-sections"
      :class="{ 'groups-dragging': draggingGroup }"
      draggable=".project-group"
      handle=".group-toggle"
      direction="vertical"
      :invert-swap="true"
      :swap-threshold="0.65"
      :animation="150"
      :force-fallback="true"
      :fallback-on-body="true"
      :fallback-tolerance="5"
      ghost-class="group-ghost"
      drag-class="group-dragging"
      :move="allowGroupMove"
      @change="changeGroups"
      @start="startGroupDrag"
      @end="draggingGroup = false"
    >
      <template #item="{ element: section }">
        <Draggable
          :model-value="section.projects"
          item-key="path"
          v-bind="dragOptions"
          :move="allowMove"
          :data-group-id="section.groupId ?? ''"
          :data-pinned="section.pinned === undefined ? '' : String(section.pinned)"
          :class="section.group ? 'project-group' : 'project-section'"
          @change="change(section, $event)"
          @start="startDrag"
          @end="dragging = false"
        >
          <template #header>
            <div
              v-if="section.group"
              class="group-heading"
              @contextmenu="groupMenu($event, section.group)"
            >
              <button
                class="group-toggle"
                title="拖曳調整群組順序，點擊展開或折疊"
                :aria-label="`${section.expanded ? '折疊' : '展開'} ${section.name} 群組`"
                :aria-expanded="section.expanded"
                @click="toggleGroup(section.group)"
              >
                <component :is="section.expanded ? ChevronDown : ChevronRight" :size="13" />
                <component :is="section.expanded ? FolderOpen : Folder" :size="14" />
                <span>{{ section.name }}</span
                ><small>{{ section.count }}</small>
              </button>
              <button
                class="icon-button group-more"
                :aria-label="`${section.name} 群組選單`"
                @click="groupMenu($event, section.group)"
              >
                <MoreHorizontal :size="14" />
              </button>
            </div>
            <div v-else class="library-label">
              <component :is="section.pinned ? Pin : FolderOpen" :size="12" />{{ section.name
              }}<span>{{ section.count }}</span>
            </div>
          </template>
          <template #item="{ element: project }">
            <ProjectItem
              :project="project"
              :active="session.active"
              :menu-open="menuPath === project.path"
              @action="emit('action', $event)"
              @toggle-menu="emit('toggleMenu', project.path)"
              @dismiss="emit('dismiss')"
              @rename="emit('rename', project)"
              @path="emit('path', project.path)"
            />
          </template>
          <template #footer>
            <p
              v-if="
                section.expanded && !section.projects.length && (!section.group || !section.count)
              "
              class="section-empty"
            >
              {{
                section.group
                  ? '拖曳專案至此群組'
                  : section.pinned
                    ? '拖曳已釘選專案至此'
                    : session.groups.length
                      ? '拖曳專案至此移出群組'
                      : session.projects.length
                        ? '找不到符合的專案。'
                        : '加入常用的 Git 專案。'
              }}
            </p>
          </template>
        </Draggable>
      </template>
    </Draggable>
  </div>
</template>

<style scoped>
.library-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: #9298a8;
  font-size: 11px;
  padding: 3px 7px;
}
.project-group {
  border: 1px solid #2e303b;
  border-radius: 6px;
  margin: 9px 0;
  min-height: 36px;
  padding: 3px;
}
.group-heading {
  display: flex;
  align-items: center;
}
.group-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 3px;
  min-width: 0;
  flex: 1;
  text-align: left;
  cursor: grab;
  touch-action: none;
  user-select: none;
}
.group-ghost {
  opacity: 0.4;
  outline: 1px dashed #b69cec;
}
.group-dragging {
  background: #20212b;
}
.group-dragging .group-toggle,
.groups-dragging .group-toggle {
  cursor: grabbing;
}
.group-toggle > span {
  white-space: nowrap;
  text-overflow: ellipsis;
  overflow: hidden;
  flex: 1;
}
.group-toggle > svg {
  flex-shrink: 0;
  color: #a899c5;
}
.group-toggle small {
  color: #898e9d;
}
.group-more {
  flex-shrink: 0;
}
.section-empty {
  padding: 10px 7px;
  margin: 0;
  color: #777e8e;
  font-size: 11px;
  line-height: 1.6;
}
.library-dragging .project-section,
.library-dragging .project-group {
  outline: 1px dashed #514761;
  outline-offset: -1px;
}
.group-editor {
  padding: 10px 7px;
  border: 1px solid #454052;
  border-radius: 6px;
  margin: 8px 0;
}
.group-editor label {
  font-size: 11px;
  display: block;
  margin-bottom: 8px;
}
.group-editor input {
  width: 100%;
  padding: 8px;
  background: #20232c;
  border: 1px solid #494455;
}
.group-editor > div {
  display: flex;
  gap: 6px;
  margin-top: 8px;
}
.group-editor p {
  font-size: 11px;
}
</style>
