<script setup lang="ts">
import { ArrowLeft, RotateCcw } from 'lucide-vue-next';
import { onMounted, ref } from 'vue';
import type { Preferences } from './preferences';

const model = defineModel<Preferences>({ required: true });
const emit = defineEmits<{ close: []; reset: [] }>();
const back = ref<HTMLButtonElement | null>(null);
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
onMounted(() => back.value?.focus());
</script>

<template>
  <section class="preferences-page" aria-label="偏好設定">
    <header class="preferences-header">
      <button
        ref="back"
        class="icon-button"
        aria-label="返回工作區"
        title="返回工作區"
        @click="emit('close')"
      >
        <ArrowLeft :size="19" />
      </button>
      <div>
        <h1>偏好設定</h1>
        <p>變更立即生效並自動儲存。</p>
      </div>
      <button class="preferences-reset soft-button" @click="emit('reset')">
        <RotateCcw :size="14" />還原預設設定
      </button>
    </header>
    <div class="preferences-scroll">
      <div class="preferences-content">
        <section class="preferences-section" aria-labelledby="preferences-typography">
          <h2 id="preferences-typography">字體</h2>
          <label class="preference-row"
            ><span
              ><strong>介面字體</strong
              ><small>留空使用預設字體；可輸入已安裝的字體名稱。</small></span
            ><input
              aria-label="介面字體"
              list="ui-fonts"
              placeholder="系統預設"
              maxlength="120"
              :value="model.fontFamily"
              @input="update({ fontFamily: ($event.target as HTMLInputElement).value })"
          /></label>
          <datalist id="ui-fonts">
            <option
              v-for="font in [
                'Inter',
                'Segoe UI',
                'Microsoft JhengHei',
                'Noto Sans TC',
                'Arial',
                'Consolas',
              ]"
              :key="font"
              :value="font"
            />
          </datalist>
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
            ><input
              aria-label="程式碼字體"
              list="code-fonts"
              placeholder="Cascadia Code"
              maxlength="120"
              :value="model.codeFontFamily"
              @input="update({ codeFontFamily: ($event.target as HTMLInputElement).value })"
          /></label>
          <datalist id="code-fonts">
            <option
              v-for="font in [
                'Cascadia Code',
                'Consolas',
                'JetBrains Mono',
                'Fira Code',
                'Courier New',
              ]"
              :key="font"
              :value="font"
            />
          </datalist>
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
              @change="update({ followBranchColor: ($event.target as HTMLInputElement).checked })"
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
              @change="update({ showColumnDividers: ($event.target as HTMLInputElement).checked })"
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
</template>
