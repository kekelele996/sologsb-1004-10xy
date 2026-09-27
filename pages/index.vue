<script setup lang="ts">
import type { DeviceKind, DiffLine, LanguageDraft, ReviewIssue, ScriptStatus, Segment, Term } from '~/types'
import { LANGUAGES, useScriptStore } from '~/stores/script'
import { buildParts, issueKindLabel } from '~/utils/terminology'

const store = useScriptStore()
const activeTab = ref('editor')
const device = ref<DeviceKind>('desktop')
const versionDialog = ref(false)
const versionName = ref('')
const leftFilter = ref('')
const compareA = ref('')
const compareB = ref('')
const helpDialog = ref(false)
const deleteTarget = ref<string | null>(null)

// 术语审校
const termDialog = ref(false)
const termDeleteTarget = ref<Term | null>(null)
const termForm = ref({ id: '', zh: '', en: '', ja: '', legacyEn: '', legacyJa: '' })
const selectedIssueIds = ref<string[]>([])

const statusOptions: Array<{ value: ScriptStatus; label: string; color: string }> = [
  { value: 'draft', label: '草稿', color: 'grey' },
  { value: 'review', label: '待审', color: 'warning' },
  { value: 'returned', label: '退回', color: 'error' },
  { value: 'approved', label: '已定稿', color: 'success' }
]
const deviceOptions: Array<{ value: DeviceKind; label: string }> = [
  { value: 'desktop', label: '桌面大屏' },
  { value: 'tablet', label: '平板导览' },
  { value: 'mobile', label: '手机导览' },
  { value: 'kiosk', label: '馆内触摸屏' }
]
const kindMeta: Record<string, { color: string; icon: string }> = {
  missing: { color: 'error', icon: 'mdi-translate-off' },
  legacy: { color: 'warning', icon: 'mdi-history' },
  mixed: { color: 'secondary', icon: 'mdi-swap-horizontal-bold' }
}

const draft = computed(() => store.selectedDraft)
const exhibit = computed(() => store.selectedExhibit)
const currentLanguage = computed(() => LANGUAGES.find(item => item.id === store.selectedLanguageId))
const currentStatus = computed(() => statusOptions.find(item => item.value === draft.value?.status) || statusOptions[0])
const filteredExhibits = computed(() => store.hallExhibits.filter(item => !leftFilter.value || `${item.code} ${item.title}`.toLowerCase().includes(leftFilter.value.toLowerCase())))
const versions = computed(() => store.versions.filter(item => item.exhibitId === store.selectedExhibitId && item.languageId === store.selectedLanguageId))
const selectedVersionA = computed(() => versions.value.find(item => item.id === compareA.value))
const selectedVersionB = computed(() => versions.value.find(item => item.id === compareB.value))
const diffLines = computed<DiffLine[]>(() => {
  const before = selectedVersionA.value?.draft.narration || ''
  const after = selectedVersionB.value?.draft.narration || ''
  return buildDiff(before, after)
})

const reviewCheck = computed(() => store.currentReviewCheck)
const activeIssues = computed<ReviewIssue[]>(() => {
  const check = reviewCheck.value
  if (!check) return []
  const ignored = new Set(check.ignoredIssueIds)
  return check.issues.filter(issue => !ignored.has(issue.id))
})
const ignoredIssues = computed<ReviewIssue[]>(() => {
  const check = reviewCheck.value
  if (!check) return []
  const ignored = new Set(check.ignoredIssueIds)
  return check.issues.filter(issue => ignored.has(issue.id))
})
interface IssueGroup { key: string; label: string; locked: boolean; issues: ReviewIssue[] }
const issueGroups = computed<IssueGroup[]>(() => {
  const map = new Map<string, IssueGroup>()
  for (const issue of activeIssues.value) {
    const key = issue.field === 'segment' ? `segment:${issue.segmentId}` : issue.field
    let group = map.get(key)
    if (!group) {
      group = { key, label: issue.locationLabel, locked: issue.field === 'segment' && issue.locked, issues: [] }
      map.set(key, group)
    }
    group.issues.push(issue)
  }
  return Array.from(map.values())
})
const counts = computed(() => ({
  missing: activeIssues.value.filter(i => i.kind === 'missing').length,
  legacy: activeIssues.value.filter(i => i.kind === 'legacy').length,
  mixed: activeIssues.value.filter(i => i.kind === 'mixed').length
}))
const applicableSelected = computed(() => {
  const selected = new Set(selectedIssueIds.value)
  return activeIssues.value.filter(i => selected.has(i.id) && !i.locked && i.kind !== 'missing' && i.replacement)
})
const reviewLogs = computed(() => store.reviewLogs.slice(0, 30))

onMounted(() => {
  store.hydrate()
  syncCompareSelection()
  window.addEventListener('keydown', handleKeydown)
})
onBeforeUnmount(() => window.removeEventListener('keydown', handleKeydown))
watch(versions, syncCompareSelection)
// 打开展项或切换语言后自动跑一次术语检查（结果随本地数据保留，重开可接着处理）
watch(() => [store.selectedExhibitId, store.selectedLanguageId, store.hydrated], () => {
  if (store.hydrated) store.autoRunReviewCheck()
}, { immediate: true })
watch(() => store.reviewFocus, (focus) => {
  if (!focus) return
  activeTab.value = 'editor'
  nextTick(() => {
    const id = focus.field === 'segment' ? `field-segment-${focus.segmentId}` : `field-${focus.field}`
    const el = document.getElementById(id)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      el.classList.remove('flash-target')
      void (el as HTMLElement).offsetWidth
      el.classList.add('flash-target')
      window.setTimeout(() => el.classList.remove('flash-target'), 2400)
    }
  })
})

function syncCompareSelection() {
  if (!versions.value.some(item => item.id === compareA.value)) compareA.value = versions.value[1]?.id || versions.value[0]?.id || ''
  if (!versions.value.some(item => item.id === compareB.value)) compareB.value = versions.value[0]?.id || ''
}
function handleKeydown(event: KeyboardEvent) {
  const modifier = event.metaKey || event.ctrlKey
  if (!modifier) return
  if (event.key.toLowerCase() === 'z') {
    event.preventDefault()
    event.shiftKey ? store.redo() : store.undo()
  }
  if (event.key.toLowerCase() === 'y') {
    event.preventDefault()
    store.redo()
  }
  if (event.key.toLowerCase() === 's') {
    event.preventDefault()
    store.createVersion('键盘快捷保存')
  }
}
function saveDraftField(field: 'title' | 'narration' | 'accessibility' | 'durationMinutes' | 'sources', event: Event) {
  const value = (event.target as HTMLInputElement | HTMLTextAreaElement).value
  store.updateDraft({ [field]: field === 'durationMinutes' ? Number(value) : value } as Partial<LanguageDraft>)
}
function saveSegment(id: string, field: 'label' | 'content', event: Event) {
  store.updateSegment(id, { [field]: (event.target as HTMLInputElement | HTMLTextAreaElement).value })
}
function submitVersion() {
  store.createVersion(versionName.value.trim() || undefined)
  versionName.value = ''
  versionDialog.value = false
}
function confirmDelete() {
  if (deleteTarget.value) store.removeSegment(deleteTarget.value)
  deleteTarget.value = null
}
function buildDiff(before: string, after: string): DiffLine[] {
  const a = before.split(/(?<=[。！？.!?])\s*/).filter(Boolean)
  const b = after.split(/(?<=[。！？.!?])\s*/).filter(Boolean)
  const rows = Array.from({ length: a.length + 1 }, () => Array<number>(b.length + 1).fill(0))
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) rows[i][j] = a[i] === b[j] ? rows[i + 1][j + 1] + 1 : Math.max(rows[i + 1][j], rows[i][j + 1])
  }
  const result: DiffLine[] = []
  let i = 0, j = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { result.push({ type: 'same', text: a[i] }); i++; j++ }
    else if (rows[i + 1][j] >= rows[i][j + 1]) { result.push({ type: 'remove', text: a[i] }); i++ }
    else { result.push({ type: 'add', text: b[j] }); j++ }
  }
  while (i < a.length) result.push({ type: 'remove', text: a[i++] })
  while (j < b.length) result.push({ type: 'add', text: b[j++] })
  return result
}
function formatTime(value: string) {
  return new Date(value).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
}
function formatFullTime(value: string) {
  return new Date(value).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
}
function segmentLabel(segment: Segment) { return segment.label || '未命名段落' }

// —— 术语审校 ——
function groupText(group: IssueGroup): string {
  if (!draft.value) return ''
  if (group.key === 'title') return draft.value.title
  if (group.key === 'narration') return draft.value.narration
  if (group.key === 'accessibility') return draft.value.accessibility
  if (group.key.startsWith('segment:')) return draft.value.segments.find(s => s.id === group.key.slice(8))?.content || ''
  return ''
}
function groupPreviewParts(group: IssueGroup) {
  const text = groupText(group)
  const selected = new Set(selectedIssueIds.value)
  const ranges = group.issues
    .filter(i => selected.has(i.id) && !i.locked && i.kind !== 'missing')
    .map(i => ({ start: i.start, end: i.end }))
  return buildParts(text, ranges)
}
function previewedText(group: IssueGroup): string {
  const selected = new Set(selectedIssueIds.value)
  let text = groupText(group)
  for (const issue of group.issues.filter(i => selected.has(i.id) && !i.locked && i.kind !== 'missing' && i.replacement).sort((a, b) => b.start - a.start)) {
    text = text.slice(0, issue.start) + issue.replacement! + text.slice(issue.end)
  }
  return text
}
function groupHasApplicable(group: IssueGroup): boolean {
  return group.issues.some(i => !i.locked && i.kind !== 'missing' && i.replacement)
}
function applyGroup(group: IssueGroup) {
  const ids = group.issues.filter(i => !i.locked && i.kind !== 'missing' && i.replacement).map(i => i.id)
  store.applyReviewFixes(ids)
  selectedIssueIds.value = selectedIssueIds.value.filter(id => !ids.includes(id))
}
function locate(issue: ReviewIssue) {
  store.locateIssue(issue)
}
function applySelected() {
  store.applyReviewFixes(selectedIssueIds.value)
  selectedIssueIds.value = []
}
function openTermDialog(term?: Term) {
  if (term) termForm.value = { id: term.id, zh: term.zh, en: term.en, ja: term.ja, legacyEn: term.legacyEn.join('，'), legacyJa: term.legacyJa.join('，') }
  else termForm.value = { id: '', zh: '', en: '', ja: '', legacyEn: '', legacyJa: '' }
  termDialog.value = true
}
function submitTerm() {
  store.saveTerm(termForm.value)
  termDialog.value = false
}
function confirmDeleteTerm() {
  if (termDeleteTarget.value) store.removeTerm(termDeleteTarget.value.id)
  termDeleteTarget.value = null
}
function isSelected(id: string) { return selectedIssueIds.value.includes(id) }
function toggleIssue(id: string) {
  if (isSelected(id)) selectedIssueIds.value = selectedIssueIds.value.filter(item => item !== id)
  else selectedIssueIds.value.push(id)
}
</script>

<template>
  <v-app class="workspace-shell">
    <a class="skip-link" href="#main-workspace">跳到主要内容</a>
    <v-app-bar color="surface" flat border>
      <template #prepend><v-app-bar-nav-icon aria-label="打开项目导航" /></template>
      <v-app-bar-title>
        <span class="project-mark">博物声</span>
        <span class="text-caption text-medium-emphasis ms-3 d-none d-md-inline">展陈脚本工作台</span>
      </v-app-bar-title>
      <v-spacer />
      <v-chip class="me-2 d-none d-sm-flex" :color="currentStatus.color" variant="tonal" size="small">
        <span class="status-dot" :style="{ background: 'currentColor' }" />{{ currentStatus.label }}
      </v-chip>
      <v-btn variant="text" prepend-icon="mdi-keyboard-outline" class="d-none d-md-flex" @click="helpDialog = true">快捷键</v-btn>
      <v-btn color="primary" prepend-icon="mdi-content-save-outline" @click="versionDialog = true">保存版本</v-btn>
    </v-app-bar>

    <v-navigation-drawer permanent width="320" color="surface" border>
      <div class="pa-4">
        <div class="section-title mb-2">展厅</div>
        <v-select
          :model-value="store.selectedHallId"
          :items="store.halls"
          item-title="name"
          item-value="id"
          hide-details
          aria-label="选择展厅"
          @update:model-value="store.selectHall"
        />
        <div class="d-flex align-center justify-space-between mt-5 mb-2">
          <div class="section-title">展项</div>
          <v-chip size="x-small" variant="tonal">{{ filteredExhibits.length }} 项</v-chip>
        </div>
        <v-text-field v-model="leftFilter" density="compact" hide-details prepend-inner-icon="mdi-magnify" placeholder="筛选展项" aria-label="筛选展项" />
        <v-list class="mt-2 bg-transparent" nav>
          <v-list-item
            v-for="item in filteredExhibits"
            :key="item.id"
            :active="item.id === store.selectedExhibitId"
            color="primary"
            rounded="lg"
            @click="store.selectExhibit(item.id)"
          >
            <template #prepend><v-chip size="small" variant="outlined">{{ item.code }}</v-chip></template>
            <v-list-item-title class="font-weight-medium">{{ item.title }}</v-list-item-title>
            <v-list-item-subtitle>{{ item.drafts.length }} 种语言</v-list-item-subtitle>
          </v-list-item>
        </v-list>
      </div>
      <v-divider />
      <div class="pa-4">
        <div class="section-title mb-3">多语言完成度</div>
        <div v-for="lang in LANGUAGES" :key="lang.id" class="mb-3">
          <button class="d-flex align-center w-100 border-0 bg-transparent text-left pa-0" :aria-pressed="lang.id === store.selectedLanguageId" @click="store.selectLanguage(lang.id)">
            <v-avatar size="32" :color="lang.id === store.selectedLanguageId ? 'primary' : 'grey-lighten-2'" :class="lang.id === store.selectedLanguageId ? 'text-white' : ''">{{ lang.shortLabel }}</v-avatar>
            <div class="ms-3 flex-grow-1">
              <div class="text-body-2 font-weight-medium">{{ lang.label }}</div>
              <v-progress-linear class="mt-1" :model-value="exhibit ? store.completionFor(exhibit, lang.id) : 0" :color="lang.id === store.selectedLanguageId ? 'primary' : 'secondary'" height="5" rounded />
            </div>
            <span class="text-caption ms-3">{{ exhibit ? store.completionFor(exhibit, lang.id) : 0 }}%</span>
          </button>
        </div>
      </div>
    </v-navigation-drawer>

    <v-main id="main-workspace" style="background:#f4f0e8">
      <div class="pa-3 pa-md-6">
        <div class="d-flex flex-wrap align-start justify-space-between ga-4 mb-5">
          <div>
            <div class="text-caption text-medium-emphasis mb-1">{{ store.selectedHall?.name }} / {{ exhibit?.code }}</div>
            <h1 class="text-h4 font-weight-bold project-mark">{{ exhibit?.title || '请选择展项' }}</h1>
            <div class="text-body-2 text-medium-emphasis mt-2">
              当前语言：{{ currentLanguage?.label }} ·
              {{ draft?.updatedAt ? `最后更新 ${formatTime(draft.updatedAt)}` : '尚未建立文稿' }}
            </div>
          </div>
          <div class="d-flex ga-2">
            <v-btn variant="outlined" prepend-icon="mdi-undo" :disabled="!store.canUndo" @click="store.undo">撤销</v-btn>
            <v-btn variant="outlined" prepend-icon="mdi-redo" :disabled="!store.canRedo" @click="store.redo">重做</v-btn>
            <v-btn variant="outlined" prepend-icon="mdi-history" @click="activeTab = 'versions'">版本</v-btn>
          </div>
        </div>

        <v-alert v-if="store.notice" class="mb-4" color="secondary" variant="tonal" closable @click:close="store.notice = ''">{{ store.notice }}</v-alert>

        <v-tabs v-model="activeTab" color="primary" bg-color="surface" rounded="lg" class="mb-4 px-2">
          <v-tab value="editor">脚本编辑</v-tab>
          <v-tab value="review">术语审校</v-tab>
          <v-tab value="versions">版本比较</v-tab>
          <v-tab value="preview">设备预览</v-tab>
          <v-tab value="sources">资料核对</v-tab>
        </v-tabs>

        <div v-if="draft">
          <v-window v-model="activeTab" :touch="false">
            <v-window-item value="editor">
              <v-row>
                <v-col cols="12" lg="8">
                  <v-card class="script-card pa-4 pa-md-6">
                    <div class="d-flex flex-wrap align-center justify-space-between ga-3 mb-5">
                      <div>
                        <div class="section-title">当前文稿</div>
                        <div class="text-h6 font-weight-bold mt-1">{{ currentLanguage?.label }}</div>
                      </div>
                      <div class="d-flex flex-wrap ga-2">
                        <v-select
                          :model-value="draft.status"
                          :items="statusOptions"
                          item-title="label"
                          item-value="value"
                          label="审校状态"
                          hide-details
                          style="min-width:150px"
                          @update:model-value="store.setStatus"
                        />
                        <v-btn color="primary" variant="tonal" prepend-icon="mdi-plus" @click="store.addSegment">新增段落</v-btn>
                      </div>
                    </div>

                    <div id="field-title" class="field-anchor">
                      <v-text-field label="展项标题" :model-value="draft.title" hint="面向观众的主标题" persistent-hint @change="saveDraftField('title', $event)" />
                    </div>
                    <v-row class="mt-2">
                      <v-col cols="12" md="5">
                        <v-text-field label="预计朗读时长（分钟）" type="number" min="0" step="0.5" :model-value="draft.durationMinutes" @change="saveDraftField('durationMinutes', $event)" />
                      </v-col>
                      <v-col cols="12" md="7">
                        <v-text-field label="资料来源" :model-value="draft.sources" hint="书籍、档案号或专家核验记录" persistent-hint @change="saveDraftField('sources', $event)" />
                      </v-col>
                    </v-row>

                    <div id="field-narration" class="field-anchor mt-2">
                      <div class="section-title mb-2">完整讲解词</div>
                      <v-textarea label="讲解词" rows="7" auto-grow counter :model-value="draft.narration" @change="saveDraftField('narration', $event)" />
                    </div>

                    <div id="field-accessibility" class="field-anchor mt-2">
                      <div class="section-title mb-2">无障碍描述</div>
                      <v-textarea label="无障碍描述" rows="4" auto-grow hint="描述尺寸、材质、色彩与可触摸特征，避免只依赖视觉" persistent-hint :model-value="draft.accessibility" @change="saveDraftField('accessibility', $event)" />
                    </div>
                  </v-card>

                  <v-card class="script-card pa-4 pa-md-6 mt-5">
                    <div class="d-flex align-center justify-space-between mb-4">
                      <div>
                        <div class="section-title">分段校对</div>
                        <div class="text-body-2 text-medium-emphasis mt-1">锁定段落不会被编辑；可在撤销中恢复。</div>
                      </div>
                      <v-chip variant="tonal">{{ draft.segments.filter(item => item.locked).length }}/{{ draft.segments.length }} 已锁定</v-chip>
                    </div>
                    <div class="d-flex flex-column ga-3">
                      <div v-for="(segment, index) in draft.segments" :key="segment.id" :id="`field-segment-${segment.id}`" class="segment-row field-anchor" :class="{ locked: segment.locked }">
                        <div class="d-flex align-center ga-2">
                          <v-btn icon size="small" variant="text" :aria-label="segment.locked ? '解锁段落' : '锁定段落'" @click="store.toggleLock(segment.id)">
                            {{ segment.locked ? '🔒' : '🔓' }}
                          </v-btn>
                          <v-text-field :model-value="segment.label" density="compact" hide-details variant="plain" :readonly="segment.locked" :aria-label="`第 ${index + 1} 段标题`" @change="saveSegment(segment.id, 'label', $event)" />
                          <v-chip v-if="segment.locked" color="success" size="small" variant="tonal">已确认</v-chip>
                          <v-btn icon="mdi-delete-outline" size="small" variant="text" color="error" :disabled="segment.locked" :aria-label="`删除第 ${index + 1} 段`" @click="deleteTarget = segment.id" />
                        </div>
                        <v-textarea class="mt-2" :model-value="segment.content" rows="2" auto-grow hide-details :readonly="segment.locked" :aria-label="segmentLabel(segment)" @change="saveSegment(segment.id, 'content', $event)" />
                      </div>
                    </div>
                  </v-card>
                </v-col>

                <v-col cols="12" lg="4">
                  <v-card class="script-card pa-5">
                    <div class="section-title mb-4">同展项语言进度</div>
                    <div v-for="lang in LANGUAGES" :key="lang.id" class="d-flex align-center ga-3 mb-4">
                      <v-progress-circular :model-value="store.completionFor(exhibit!, lang.id)" size="52" width="5" :color="lang.id === store.selectedLanguageId ? 'primary' : 'secondary'">
                        {{ store.completionFor(exhibit!, lang.id) }}
                      </v-progress-circular>
                      <div class="flex-grow-1">
                        <div class="font-weight-medium">{{ lang.label }}</div>
                        <div class="text-caption text-medium-emphasis">
                          {{ exhibit?.drafts.find(item => item.languageId === lang.id) ? store.statusLabel(exhibit!.drafts.find(item => item.languageId === lang.id)!.status) : '尚未创建' }}
                        </div>
                      </div>
                      <v-btn size="small" variant="text" :disabled="lang.id === store.selectedLanguageId" @click="store.selectLanguage(lang.id)">切换</v-btn>
                    </div>
                  </v-card>
                  <v-card class="script-card pa-5 mt-5">
                    <div class="section-title mb-3">审校检查</div>
                    <v-list density="compact" class="bg-transparent">
                      <v-list-item :prepend-icon="draft.narration.length > 80 ? 'mdi-check-circle' : 'mdi-alert-circle'" :title="`讲解词 ${draft.narration.length} 字`" />
                      <v-list-item :prepend-icon="draft.accessibility.length > 30 ? 'mdi-check-circle' : 'mdi-alert-circle'" :title="`无障碍描述 ${draft.accessibility.length} 字`" />
                      <v-list-item :prepend-icon="draft.sources ? 'mdi-check-circle' : 'mdi-alert-circle'" :title="draft.sources ? '资料来源已填写' : '缺少资料来源'" />
                    </v-list>
                    <v-alert class="mt-3" type="info" variant="tonal" density="compact">
                      估算语速约 {{ Math.max(1, Math.round(draft.narration.length / 220 * 10) / 10) }} 分钟，请与目标时长核对。
                    </v-alert>
                    <v-btn variant="tonal" color="primary" prepend-icon="mdi-spellchecks" class="mt-3" @click="activeTab = 'review'">前往术语审校</v-btn>
                  </v-card>
                </v-col>
              </v-row>
            </v-window-item>

            <v-window-item value="review">
              <v-row>
                <v-col cols="12" lg="8">
                  <v-card class="script-card pa-4 pa-md-6">
                    <div class="d-flex flex-wrap align-center justify-space-between ga-3 mb-4">
                      <div>
                        <div class="section-title">术语检查结果</div>
                        <div class="text-body-2 text-medium-emphasis mt-1">
                          {{ exhibit?.code }} · {{ currentLanguage?.label }}
                          <template v-if="reviewCheck"> · 检查于 {{ formatFullTime(reviewCheck.createdAt) }}</template>
                        </div>
                      </div>
                      <div class="d-flex ga-2 flex-wrap">
                        <v-btn color="primary" variant="tonal" prepend-icon="mdi-refresh" @click="store.runReviewCheck()">重新检查</v-btn>
                        <v-btn variant="outlined" prepend-icon="mdi-close-circle-outline" :disabled="!reviewCheck" @click="store.dismissReviewCheck()">放弃检查</v-btn>
                      </div>
                    </div>

                    <v-alert v-if="draft.languageId === 'zh'" type="info" variant="tonal" class="mb-4">
                      当前是中文原稿。请切换到 English 或 日本語 文稿，检查漏译、旧译与同段混用。
                    </v-alert>

                    <template v-else>
                      <div class="d-flex ga-2 flex-wrap mb-4">
                        <v-chip color="error" variant="tonal" prepend-icon="mdi-translate-off">漏译 {{ counts.missing }}</v-chip>
                        <v-chip color="warning" variant="tonal" prepend-icon="mdi-history">旧译 {{ counts.legacy }}</v-chip>
                        <v-chip color="secondary" variant="tonal" prepend-icon="mdi-swap-horizontal-bold">混用 {{ counts.mixed }}</v-chip>
                        <v-chip variant="tonal" prepend-icon="mdi-bookmark-outline">仅提示 {{ ignoredIssues.length }}</v-chip>
                      </div>

                      <v-alert type="warning" variant="tonal" density="compact" class="mb-4">
                        漏译需人工翻译；已确认（锁定）段落只提示不写入。替换前可在每段下方预览，放弃检查不会改动正文。
                      </v-alert>

                      <v-alert v-if="reviewCheck && !activeIssues.length && !ignoredIssues.length" type="success" variant="tonal" class="mb-4">
                        本次检查未发现术语问题。
                      </v-alert>

                      <div class="d-flex flex-column ga-4">
                        <div v-for="group in issueGroups" :key="group.key" class="issue-group">
                          <div class="d-flex align-center ga-2 flex-wrap mb-2">
                            <v-icon size="small" color="primary">mdi-text-box-outline</v-icon>
                            <span class="font-weight-medium">{{ group.label }}</span>
                            <v-chip v-if="group.locked" color="success" size="x-small" variant="tonal" prepend-icon="mdi-lock">已确认段落 · 仅提示</v-chip>
                            <v-chip size="x-small" variant="outlined">{{ group.issues.length }} 处</v-chip>
                          </div>

                          <v-list density="compact" class="issue-list rounded-lg mb-2">
                            <v-list-item v-for="issue in group.issues" :key="issue.id" :class="{ 'issue-disabled': issue.locked || issue.kind === 'missing' }">
                              <template #prepend>
                                <v-tooltip v-if="!issue.locked && issue.kind !== 'missing'" location="top" text="勾选后可批量预览并替换">
                                  <template #activator="{ props }">
                                    <v-checkbox-btn v-bind="props" :model-value="isSelected(issue.id)" density="compact" hide-details color="primary" @update:model-value="toggleIssue(issue.id)" />
                                  </template>
                                </v-tooltip>
                                <v-icon v-else :icon="issue.locked ? 'mdi-lock' : 'mdi-translate-off'" :color="issue.locked ? 'success' : 'error'" size="small" class="ma-2" />
                              </template>
                              <v-list-item-title>
                                <v-chip :color="kindMeta[issue.kind].color" size="x-small" variant="tonal" class="me-2">{{ issueKindLabel(issue.kind) }}</v-chip>
                                <span class="text-body-2">术语“{{ issue.zh }}”命中「{{ issue.matched }}」</span>
                              </v-list-item-title>
                              <v-list-item-subtitle class="mt-1">
                                <template v-if="issue.kind === 'missing'">外文中残留中文原词，请人工补译为「{{ issue.replacement }}」，不能自动替换。</template>
                                <template v-else-if="issue.kind === 'legacy'">旧译，标准译法为「{{ issue.replacement }}」。<template v-if="issue.forms && issue.forms.length > 1">同段写法：{{ issue.forms.join(' / ') }}</template></template>
                                <template v-else>同一段出现多种译法：{{ issue.forms?.join(' / ') }}，建议统一为「{{ issue.replacement }}」。</template>
                                <em v-if="issue.locked" class="text-success ms-1">（已确认段落，不会写入）</em>
                              </v-list-item-subtitle>
                              <template #append>
                                <div class="d-flex ga-1">
                                  <v-btn size="x-small" variant="text" prepend-icon="mdi-target" @click="locate(issue)">定位</v-btn>
                                  <v-btn v-if="!issue.locked && issue.kind !== 'missing'" size="x-small" variant="text" color="primary" prepend-icon="mdi-auto-fix" @click="store.applyReviewFixes([issue.id])">替换</v-btn>
                                  <v-btn size="x-small" variant="text" prepend-icon="mdi-bookmark-outline" @click="store.ignoreIssue(issue.id)">仅提示</v-btn>
                                </div>
                              </template>
                            </v-list-item>
                          </v-list>

                          <div v-if="groupHasApplicable(group)" class="preview-box rounded-lg pa-3">
                            <div class="d-flex align-center justify-space-between ga-2 flex-wrap mb-2">
                              <span class="text-caption font-weight-bold">{{ selectedIssueIds.some(id => group.issues.some(i => i.id === id)) ? '替换预览（高亮为将改动）' : '勾选问题以预览替换' }}</span>
                              <v-btn size="small" variant="tonal" color="primary" prepend-icon="mdi-auto-fix" :disabled="!group.issues.some(i => isSelected(i.id) && !i.locked && i.kind !== 'missing')" @click="applyGroup(group)">应用本段勾选</v-btn>
                            </div>
                            <p class="preview-line before mb-1"><span class="preview-tag">原文</span><span v-for="(part, pi) in groupPreviewParts(group)" :key="pi" :class="{ 'preview-mark': part.marked }">{{ part.text }}</span></p>
                            <p class="preview-line after mb-0"><span class="preview-tag">替换后</span>{{ previewedText(group) }}</p>
                          </div>
                        </div>
                      </div>

                      <v-divider v-if="ignoredIssues.length" class="my-4" />
                      <details v-if="ignoredIssues.length" class="ignored-box">
                        <summary class="text-body-2 text-medium-emphasis cursor-pointer">仅提示的问题（{{ ignoredIssues.length }}）</summary>
                        <v-list density="compact" class="mt-2">
                          <v-list-item v-for="issue in ignoredIssues" :key="issue.id">
                            <v-list-item-title class="text-body-2">
                              <v-chip :color="kindMeta[issue.kind].color" size="x-small" variant="tonal" class="me-2">{{ issueKindLabel(issue.kind) }}</v-chip>
                              {{ issue.locationLabel }} · “{{ issue.zh }}” · 「{{ issue.matched }}」
                            </v-list-item-title>
                            <template #append>
                              <v-btn size="x-small" variant="text" prepend-icon="mdi-target" @click="locate(issue)">定位</v-btn>
                            </template>
                          </v-list-item>
                        </v-list>
                      </details>

                      <v-slide-y-reverse-transition>
                        <div v-if="applicableSelected.length" class="d-flex align-center ga-3 flex-wrap mt-5 rounded-lg pa-3 batch-bar">
                          <span class="text-body-2 font-weight-medium">已选 {{ applicableSelected.length }} 处可替换</span>
                          <v-spacer />
                          <v-btn size="small" variant="text" @click="selectedIssueIds = []">清空选择</v-btn>
                          <v-btn size="small" color="primary" variant="tonal" prepend-icon="mdi-auto-fix" @click="applySelected">预览并批量替换所选</v-btn>
                        </div>
                      </v-slide-y-reverse-transition>
                    </template>
                  </v-card>
                </v-col>

                <v-col cols="12" lg="4">
                  <v-card class="script-card pa-5">
                    <div class="d-flex align-center justify-space-between mb-3">
                      <div class="section-title">术语表</div>
                      <v-btn size="small" color="primary" variant="tonal" prepend-icon="mdi-plus" @click="openTermDialog()">登记术语</v-btn>
                    </div>
                    <p class="text-caption text-medium-emphasis mb-3">登记中文词与英日标准译法；调整标准译法时，旧译法会自动保留，继续用于旧译提示。</p>
                    <v-list density="compact" class="bg-transparent">
                      <v-list-item v-for="term in store.terms" :key="term.id" class="term-row">
                        <v-list-item-title class="font-weight-medium">{{ term.zh }}</v-list-item-title>
                        <v-list-item-subtitle>
                          <div class="d-flex ga-1 flex-wrap mt-1">
                            <v-chip size="x-small" variant="outlined" class="me-0">EN {{ term.en || '—' }}</v-chip>
                            <v-chip size="x-small" variant="outlined" class="me-0">日 {{ term.ja || '—' }}</v-chip>
                          </div>
                          <div v-if="term.legacyEn.length || term.legacyJa.length" class="mt-1 text-caption">
                            旧译：{{ [...term.legacyEn.map(t => `EN ${t}`), ...term.legacyJa.map(t => `日 ${t}`)].join('，') }}
                          </div>
                        </v-list-item-subtitle>
                        <template #append>
                          <div class="d-flex ga-1">
                            <v-btn icon="mdi-pencil-outline" size="small" variant="text" :aria-label="`编辑术语 ${term.zh}`" @click="openTermDialog(term)" />
                            <v-btn icon="mdi-delete-outline" size="small" variant="text" color="error" :aria-label="`删除术语 ${term.zh}`" @click="termDeleteTarget = term" />
                          </div>
                        </template>
                      </v-list-item>
                    </v-list>
                  </v-card>

                  <v-card class="script-card pa-5 mt-5">
                    <div class="section-title mb-3">审校记录</div>
                    <p class="text-caption text-medium-emphasis mb-3">术语、段落与时间均保存在本机，重开浏览器后可接着处理。</p>
                    <v-timeline density="compact" side="end" v-if="reviewLogs.length">
                      <v-timeline-item v-for="log in reviewLogs" :key="log.id" size="small" dot-color="#8a6d3b">
                        <div class="text-body-2 font-weight-medium">{{ log.action }}<span class="text-caption text-medium-emphasis ms-2">{{ formatFullTime(log.time) }}</span></div>
                        <div class="text-caption text-medium-emphasis">{{ log.detail }}</div>
                        <div class="mt-1 d-flex ga-1 flex-wrap">
                          <v-chip v-if="log.termZh" size="x-small" variant="tonal" class="me-0">{{ log.termZh }}</v-chip>
                          <v-chip v-if="log.exhibitCode" size="x-small" variant="outlined" class="me-0">{{ log.exhibitCode }}</v-chip>
                          <v-chip v-if="log.location" size="x-small" variant="outlined" class="me-0">{{ log.location }}</v-chip>
                        </div>
                      </v-timeline-item>
                    </v-timeline>
                    <div v-else class="text-medium-emphasis text-body-2 pa-2">尚无审校记录。</div>
                  </v-card>
                </v-col>
              </v-row>
            </v-window-item>

            <v-window-item value="versions">
              <v-card class="script-card pa-4 pa-md-6">
                <div class="d-flex flex-wrap align-center justify-space-between ga-3 mb-5">
                  <div>
                    <div class="section-title">版本比较</div>
                    <div class="text-h6 font-weight-bold mt-1">选择同一展项、同一语言的两个快照</div>
                  </div>
                  <v-btn color="primary" prepend-icon="mdi-content-save-plus-outline" @click="versionDialog = true">保存当前版本</v-btn>
                </div>
                <v-alert v-if="versions.length < 2" type="info" variant="tonal">至少保存两个版本后即可比较。当前有 {{ versions.length }} 个版本。</v-alert>
                <template v-else>
                  <v-row>
                    <v-col cols="12" md="6"><v-select v-model="compareA" :items="versions" item-title="name" item-value="id" label="基准版本" /></v-col>
                    <v-col cols="12" md="6"><v-select v-model="compareB" :items="versions" item-title="name" item-value="id" label="目标版本" /></v-col>
                  </v-row>
                  <div class="d-flex ga-4 text-caption text-medium-emphasis mb-2">
                    <span><span class="status-dot" style="background:#9b2c25" /> 删除</span>
                    <span><span class="status-dot" style="background:#2f6b45" /> 新增</span>
                  </div>
                  <div class="rounded-lg border pa-3 bg-white">
                    <p v-for="(line, index) in diffLines" :key="index" class="diff-line" :class="`diff-${line.type}`">{{ line.text }}</p>
                    <div v-if="!diffLines.length" class="text-medium-emphasis pa-4">所选版本内容一致。</div>
                  </div>
                  <v-list class="mt-4 bg-transparent">
                    <v-list-item v-for="version in versions" :key="version.id" :title="version.name" :subtitle="formatTime(version.createdAt)">
                      <template #append>
                        <div class="d-flex ga-2 align-center">
                          <v-chip v-if="version.reviewCheckedAt" size="x-small" variant="tonal" color="secondary" prepend-icon="mdi-spellchecks">含术语检查 {{ version.reviewIssues?.length || 0 }} 处</v-chip>
                          <v-btn variant="outlined" size="small" @click="store.restoreVersion(version.id)">恢复此版</v-btn>
                        </div>
                      </template>
                    </v-list-item>
                  </v-list>
                </template>
              </v-card>
            </v-window-item>

            <v-window-item value="preview">
              <v-card class="script-card pa-4 pa-md-6">
                <div class="d-flex flex-wrap align-center justify-space-between ga-3 mb-5">
                  <div>
                    <div class="section-title">设备排版预览</div>
                    <div class="text-h6 font-weight-bold mt-1">以展项实际阅读顺序预览</div>
                  </div>
                  <v-btn-toggle v-model="device" mandatory variant="outlined" divided>
                    <v-btn v-for="item in deviceOptions" :key="item.value" :value="item.value">{{ item.label }}</v-btn>
                  </v-btn-toggle>
                </div>
                <div class="preview-frame" :class="device">
                  <div class="preview-content">
                    <div class="text-overline text-medium-emphasis">{{ exhibit?.code }} · {{ currentLanguage?.label }}</div>
                    <h2 class="text-h4 font-weight-bold mt-2">{{ draft.title }}</h2>
                    <p class="text-body-1 mt-6" style="line-height:1.9;white-space:pre-wrap">{{ draft.narration }}</p>
                    <v-divider class="my-6" />
                    <div class="section-title">无障碍描述</div>
                    <p class="text-body-2 mt-2" style="line-height:1.8;white-space:pre-wrap">{{ draft.accessibility }}</p>
                    <div class="mt-7 text-caption text-medium-emphasis">预计讲解 {{ draft.durationMinutes }} 分钟</div>
                  </div>
                </div>
              </v-card>
            </v-window-item>

            <v-window-item value="sources">
              <v-row>
                <v-col cols="12" md="7">
                  <v-card class="script-card pa-5">
                    <div class="section-title mb-3">来源与核验记录</div>
                    <v-textarea :model-value="draft.sources" rows="8" @change="saveDraftField('sources', $event)" />
                    <v-alert class="mt-4" type="warning" variant="tonal">发布前请由内容负责人逐条核对来源。当前无障碍描述与实物尺寸需由教育部门复核。</v-alert>
                  </v-card>
                </v-col>
                <v-col cols="12" md="5">
                  <v-card class="script-card pa-5">
                    <div class="section-title mb-3">段落锁定概况</div>
                    <v-timeline density="compact" side="end">
                      <v-timeline-item v-for="segment in draft.segments" :key="segment.id" :dot-color="segment.locked ? 'success' : 'grey'" size="small">
                        <div class="font-weight-medium">{{ segment.label }}</div>
                        <div class="text-caption text-medium-emphasis">{{ segment.locked ? '已锁定，审校确认' : '编辑中' }}</div>
                      </v-timeline-item>
                    </v-timeline>
                  </v-card>
                </v-col>
              </v-row>
            </v-window-item>
          </v-window>
        </div>
        <v-empty-state v-else icon="mdi-script-text-outline" title="尚未选择展项" text="请从左侧选择一个展厅和展项。" />
      </div>
    </v-main>

    <v-dialog v-model="versionDialog" max-width="520">
      <v-card class="pa-3">
        <v-card-title>保存版本快照</v-card-title>
        <v-card-text>
          <p class="mb-4 text-medium-emphasis">将当前“{{ draft?.title }}”的完整内容、锁定状态和术语检查结果保存为只读版本。</p>
          <v-text-field v-model="versionName" label="版本名称（可选）" autofocus @keyup.enter="submitVersion" />
        </v-card-text>
        <v-card-actions><v-spacer /><v-btn @click="versionDialog = false">取消</v-btn><v-btn color="primary" @click="submitVersion">保存快照</v-btn></v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog :model-value="Boolean(deleteTarget)" max-width="440" @update:model-value="deleteTarget = null">
      <v-card class="pa-3">
        <v-card-title>删除这个段落？</v-card-title>
        <v-card-text>删除后可使用撤销恢复。</v-card-text>
        <v-card-actions><v-spacer /><v-btn @click="deleteTarget = null">取消</v-btn><v-btn color="error" @click="confirmDelete">删除</v-btn></v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="termDialog" max-width="560">
      <v-card class="pa-3">
        <v-card-title>{{ termForm.id ? '调整术语' : '登记术语' }}</v-card-title>
        <v-card-text>
          <v-text-field v-model="termForm.zh" label="中文词" hint="如：玉琮" persistent-hint class="mb-2" />
          <v-text-field v-model="termForm.en" label="英文标准译法" hint="如：jade cong" persistent-hint class="mb-2" />
          <v-text-field v-model="termForm.ja" label="日文标准译法" hint="如：玉琮" persistent-hint class="mb-2" />
          <v-text-field v-model="termForm.legacyEn" label="英文旧译法（多个用逗号或分号分隔）" persistent-hint class="mb-2" />
          <v-text-field v-model="termForm.legacyJa" label="日文旧译法（多个用逗号或分号分隔）" persistent-hint />
          <v-alert type="info" variant="tonal" density="compact" class="mt-3">保存时若标准译法被改动，原标准译法会自动并入旧译法，历史译法不会丢失。</v-alert>
        </v-card-text>
        <v-card-actions><v-spacer /><v-btn @click="termDialog = false">取消</v-btn><v-btn color="primary" :disabled="!termForm.zh.trim()" @click="submitTerm">保存术语</v-btn></v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog :model-value="Boolean(termDeleteTarget)" max-width="440" @update:model-value="termDeleteTarget = null">
      <v-card class="pa-3">
        <v-card-title>删除术语“{{ termDeleteTarget?.zh }}”？</v-card-title>
        <v-card-text>删除后该词的英日译法与旧译记录一并移除；已写入正文的替换不会回退。</v-card-text>
        <v-card-actions><v-spacer /><v-btn @click="termDeleteTarget = null">取消</v-btn><v-btn color="error" @click="confirmDeleteTerm">删除</v-btn></v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="helpDialog" max-width="520">
      <v-card class="pa-3">
        <v-card-title>键盘操作</v-card-title>
        <v-card-text>
          <v-list>
            <v-list-item prepend-icon="mdi-apple-keyboard-command" title="Ctrl / ⌘ + Z" subtitle="撤销上一步编辑" />
            <v-list-item prepend-icon="mdi-redo" title="Ctrl / ⌘ + Shift + Z" subtitle="重做" />
            <v-list-item prepend-icon="mdi-content-save-outline" title="Ctrl / ⌘ + S" subtitle="保存当前版本快照" />
            <v-list-item prepend-icon="mdi-keyboard-tab" title="Tab / Shift + Tab" subtitle="在字段、状态与段落操作之间移动" />
          </v-list>
        </v-card-text>
        <v-card-actions><v-spacer /><v-btn color="primary" @click="helpDialog = false">知道了</v-btn></v-card-actions>
      </v-card>
    </v-dialog>

    <v-snackbar :model-value="Boolean(store.notice)" timeout="2600" location="bottom right" @update:model-value="store.notice = ''">
      {{ store.notice }}
      <template #actions><v-btn variant="text" @click="store.notice = ''">关闭</v-btn></template>
    </v-snackbar>
  </v-app>
</template>
