<script setup lang="ts">
import { RotateCcw, X } from 'lucide-vue-next';
import { computed, onMounted, ref } from 'vue';
import { listSystemFonts, native } from './api';
import { toastPositions, type Preferences } from './preferences';
import type { ToastDismissal } from './toasts';
import UpdateSettings from './UpdateSettings.vue';
import type { AppUpdate } from './appUpdate';

defineProps<{ updater: AppUpdate }>();

const model = defineModel<Preferences>({ required: true });
const emit = defineEmits<{ close: []; reset: []; previewToast: [dismissal: ToastDismissal] }>();
const dialog = ref<HTMLElement | null>(null);
const closeButton = ref<HTMLButtonElement | null>(null);
const fonts = ref<string[]>(
  native ? [] : ['Arial', 'Cascadia Code', 'Consolas', 'Courier New', 'Segoe UI'],
);
const fontOptions = computed(() => [
  ...new Set([...fonts.value, model.value.fontFamily, model.value.codeFontFamily].filter(Boolean)),
]);
const fontListMessage = ref(
  native ? '正在載入系統字體…' : '瀏覽器預覽僅提供示範字體，桌面版會列出系統字體。',
);
function keydown(event: KeyboardEvent) {
  if (event.key !== 'Tab') return;
  const controls = Array.from(
    dialog.value?.querySelectorAll<HTMLElement>(
      'button:not(:disabled), input:not(:disabled), select:not(:disabled), summary',
    ) ?? [],
  );
  const first = controls[0];
  const last = controls.at(-1);
  if (
    (event.shiftKey && document.activeElement === first) ||
    (!event.shiftKey && document.activeElement === last)
  ) {
    event.preventDefault();
    (event.shiftKey ? last : first)?.focus();
  }
}
function update(patch: Partial<Preferences>) {
  model.value = { ...model.value, ...patch };
}
function setFontSize(event: Event) {
  const input = event.target as HTMLInputElement;
  const size = Number(input.value);
  if (input.value && Number.isFinite(size) && size >= 11 && size <= 20) {
    update({ fontSize: Math.round(size) });
  }
}
function normalizeFontSize(event: Event) {
  const input = event.target as HTMLInputElement;
  const size = Number(input.value);
  const normalized =
    input.value && Number.isFinite(size)
      ? Math.max(11, Math.min(20, Math.round(size)))
      : model.value.fontSize;
  input.value = String(normalized);
  update({ fontSize: normalized });
}
onMounted(async () => {
  closeButton.value?.focus();
  if (!native) return;
  try {
    fonts.value = await listSystemFonts();
    fontListMessage.value = fonts.value.length ? '' : '未找到系統字體。';
  } catch {
    fontListMessage.value = '無法載入系統字體，請重新開啟偏好設定再試。';
  }
});
</script>

<template>
  <div class="modal-backdrop preferences-backdrop" @click.self="emit('close')" @keydown="keydown">
    <section
      ref="dialog"
      class="preferences-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="preferences-title"
      aria-describedby="preferences-description"
    >
      <header class="preferences-header">
        <div>
          <h1 id="preferences-title">偏好設定</h1>
          <p id="preferences-description">變更立即生效並自動儲存。</p>
        </div>
        <button class="preferences-reset soft-button" @click="emit('reset')">
          <RotateCcw :size="14" />還原預設設定
        </button>
        <button
          ref="closeButton"
          class="icon-button"
          aria-label="關閉偏好設定"
          :disabled="updater.state.phase === 'installing'"
          title="關閉偏好設定（Esc）"
          @click="emit('close')"
        >
          <X :size="19" />
        </button>
      </header>
      <div class="preferences-scroll">
        <div class="preferences-content">
          <UpdateSettings :updater="updater" />
          <section class="preferences-section" aria-labelledby="preferences-toast">
            <h2 id="preferences-toast">通知訊息</h2>
            <label class="preference-row">
              <span
                ><strong>Toast 顯示位置</strong><small>所有通知共用，變更立即生效。</small></span
              >
              <select
                aria-label="Toast 顯示位置"
                :value="model.toastPosition"
                @change="
                  update({
                    toastPosition: ($event.target as HTMLSelectElement)
                      .value as Preferences['toastPosition'],
                  })
                "
              >
                <option
                  v-for="(label, position) in toastPositions"
                  :key="position"
                  :value="position"
                >
                  {{ label }}
                </option>
              </select>
            </label>
            <label class="preference-row">
              <span
                ><strong>自動關閉倒數</strong
                ><small>成功與一般提示自動關閉；錯誤需手動關閉。</small></span
              >
              <select
                aria-label="Toast 自動關閉秒數"
                :value="model.toastDuration"
                @change="
                  update({ toastDuration: Number(($event.target as HTMLSelectElement).value) })
                "
              >
                <option v-for="seconds in [3, 5, 8, 10, 15]" :key="seconds" :value="seconds">
                  {{ seconds }} 秒
                </option>
              </select>
            </label>
            <p class="preferences-note">滑鼠停留或鍵盤聚焦於通知時暫停倒數。</p>
            <div class="toast-preview-buttons">
              <button class="soft-button" @click="emit('previewToast', 'auto')">
                預覽自動關閉
              </button>
              <button class="soft-button" @click="emit('previewToast', 'manual')">
                預覽手動關閉
              </button>
            </div>
          </section>
          <section class="preferences-section" aria-labelledby="preferences-typography">
            <h2 id="preferences-typography">字體</h2>
            <p v-if="fontListMessage" class="preferences-note" role="status">
              {{ fontListMessage }}
            </p>
            <label class="preference-row"
              ><span
                ><strong>介面字體</strong><small>選擇已安裝的字體，或使用系統預設。</small></span
              ><select
                id="ui-fonts"
                aria-label="介面字體"
                :value="model.fontFamily"
                @change="update({ fontFamily: ($event.target as HTMLSelectElement).value })"
              >
                <option value="">系統預設</option>
                <option v-for="font in fontOptions" :key="font" :value="font">{{ font }}</option>
              </select></label
            >
            <div class="preference-row">
              <span><strong>字體大小</strong><small>同步調整介面文字與列表列高。</small></span>
              <div class="font-size-control">
                <input
                  aria-label="字體大小滑桿"
                  type="range"
                  min="11"
                  max="20"
                  :value="model.fontSize"
                  @input="setFontSize"
                /><input
                  aria-label="字體大小"
                  type="number"
                  min="11"
                  max="20"
                  :value="model.fontSize"
                  @input="setFontSize"
                  @change="normalizeFontSize"
                /><span>px</span>
              </div>
            </div>
            <label class="preference-row"
              ><span><strong>程式碼字體</strong><small>套用於 SHA 與檔案差異。</small></span
              ><select
                id="code-fonts"
                aria-label="程式碼字體"
                :value="model.codeFontFamily"
                @change="update({ codeFontFamily: ($event.target as HTMLSelectElement).value })"
              >
                <option value="">系統預設</option>
                <option v-for="font in fontOptions" :key="font" :value="font">{{ font }}</option>
              </select></label
            >
            <div class="font-preview">
              <span>字體預覽 · Commit 作者與分支</span><code>abc1234 · const commit = HEAD;</code>
            </div>
          </section>
          <section class="preferences-section" aria-labelledby="preferences-graph">
            <h2 id="preferences-graph">圖譜與標籤</h2>
            <label class="preference-row"
              ><span
                ><strong>分支標籤跟隨分支線顏色</strong
                ><small>分支名稱標籤使用所在節點的分支配色。</small></span
              ><input
                type="checkbox"
                :checked="model.followBranchColor"
                @change="
                  update({ followBranchColor: ($event.target as HTMLInputElement).checked })
                "
            /></label>
            <label class="preference-row"
              ><span
                ><strong>Git 標籤跟隨分支線顏色</strong
                ><small>版本標籤也使用所在節點的分支配色。</small></span
              ><input
                type="checkbox"
                :checked="model.followTagColor"
                @change="update({ followTagColor: ($event.target as HTMLInputElement).checked })"
            /></label>
            <label class="preference-row"
              ><span
                ><strong>醒目顯示 HEAD 節點</strong
                ><small>放大目前 checkout 的節點並顯示外框。</small></span
              ><input
                type="checkbox"
                :checked="model.highlightHead"
                @change="update({ highlightHead: ($event.target as HTMLInputElement).checked })"
            /></label>
            <label class="preference-row"
              ><span
                ><strong>選取 commit 時高亮整條線</strong
                ><small>以光暈標示選取 commit 所屬的整條分支線。</small></span
              ><input
                type="checkbox"
                :checked="model.highlightSelectedLine"
                @change="
                  update({ highlightSelectedLine: ($event.target as HTMLInputElement).checked })
                "
            /></label>
          </section>
          <section class="preferences-section" aria-labelledby="preferences-history">
            <h2 id="preferences-history">列表與時間</h2>
            <label class="preference-row"
              ><span><strong>列表密度</strong><small>調整 commit 列表的間距。</small></span
              ><select
                aria-label="列表密度"
                :value="model.density"
                @change="
                  update({
                    density: ($event.target as HTMLSelectElement).value as Preferences['density'],
                  })
                "
              >
                <option value="comfortable">標準</option>
                <option value="compact">緊湊</option>
              </select></label
            >
            <label class="preference-row"
              ><span><strong>日期格式</strong></span
              ><select
                aria-label="日期格式"
                :value="model.dateFormat"
                @change="
                  update({
                    dateFormat: ($event.target as HTMLSelectElement)
                      .value as Preferences['dateFormat'],
                  })
                "
              >
                <option value="short">月 / 日</option>
                <option value="full">年 / 月 / 日</option>
              </select></label
            >
            <label class="preference-row"
              ><span><strong>使用 24 小時制</strong></span
              ><input
                type="checkbox"
                :checked="model.use24HourTime"
                @change="update({ use24HourTime: ($event.target as HTMLInputElement).checked })"
            /></label>
            <label class="preference-row"
              ><span><strong>顯示欄位分隔線</strong></span
              ><input
                type="checkbox"
                :checked="model.showColumnDividers"
                @change="
                  update({ showColumnDividers: ($event.target as HTMLInputElement).checked })
                "
            /></label>
          </section>
          <section class="preferences-section" aria-labelledby="preferences-browsing">
            <h2 id="preferences-browsing">瀏覽預設值</h2>
            <p class="preferences-note">只套用到之後新開啟的專案分頁。</p>
            <label class="preference-row"
              ><span><strong>預設顯示遠端分支</strong></span
              ><input
                type="checkbox"
                :checked="model.defaultRemotes"
                @change="update({ defaultRemotes: ($event.target as HTMLInputElement).checked })"
            /></label>
            <label class="preference-row"
              ><span><strong>首次載入 commit 數量</strong></span
              ><select
                aria-label="首次載入 commit 數量"
                :value="model.defaultCommitLimit"
                @change="
                  update({ defaultCommitLimit: Number(($event.target as HTMLSelectElement).value) })
                "
              >
                <option v-for="limit in [500, 1000, 2000, 5000]" :key="limit" :value="limit">
                  {{ limit.toLocaleString('zh-TW') }} 筆
                </option>
              </select></label
            >
          </section>
        </div>
      </div>
    </section>
  </div>
</template>
