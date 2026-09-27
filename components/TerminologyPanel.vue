<script setup lang="ts">
import type { Term, TermIssue } from '~/types'
import { LANGUAGES, useScriptStore } from '~/stores/script'
import { buildTermIssues, planReplacement } from '~/utils/terminology'

const emit = defineEmits<{ locate: [issue: TermIssue] }>()
const store = useScriptStore()

const termDialog = ref(false)
const newTermZh = ref('')
const newTermLang = ref('en')
const newTermText = ref('')
const termFilter = ref('')
const adjustTarget = ref<Term | null>(null)
const adjustText = ref('')
const previewIssue = ref<TermIssue | null>(null)

const exhibit = computed(() => store.selectedExhibit)
const checkLanguages = LANGUAGES.filter(item => item.id !== 'zh')
const issues = computed(() => exhibit.value ? buildTermIssues(exhibit.value, store.terms) : [])
const summary = computed(() => ({
  missing: issues.value.filter(item => item.kind === 'missing').length,
  former: issues.value.filter(item => item.kind === 'former').length,
  mixed: issues.value.filter(item => item.kind === 'mixed').length
}))
const filteredTerms = computed(() => store.terms.filter((term) => {
  if (!termFilter.value) return true
  const haystack = `${term.zh} ${term.variants.map(variant => variant.text).join(' ')}`.toLowerCase()
  return haystack.includes(termFilter.value.toLowerCase())
}))

interface IssueGroup { key: string; title: string; locked: boolean; issues: TermIssue[] }
const groups = computed<Record<string, IssueGroup[]>>(() => {
  const result: Record<string, IssueGroup[]> = {}
  for (const lang of checkLanguages) {
    const map = new Map<string, IssueGroup & { index: number }>()
    for (const issue of issues.value.filter(item => item.languageId === lang.id)) {
      const missing = issue.kind === 'missing'
      const key = `${missing ? 'zh' : lang.id}-${issue.segmentId}`
      if (!map.has(key)) {
        map.set(key, {
          key,
          title: missing
            ? `中文原稿 · 第 ${issue.segmentIndex + 1} 段「${issue.segmentLabel || '未命名段落'}」`
            : `第 ${issue.segmentIndex + 1} 段「${issue.segmentLabel || '未命名段落'}」`,
          locked: !missing && issue.locked,
          index: issue.segmentIndex,
          issues: []
        })
      }
      map.get(key)!.issues.push(issue)
    }
    result[lang.id] = [...map.values()].sort((a, b) => a.index - b.index)
  }
  return result
})

// 预览始终基于当前正文实时计算，段落被删或内容已变时自动关闭
const previewPlan = computed(() => {
  const issue = previewIssue.value
  if (!issue) return null
  const segment = exhibit.value?.drafts
    .find(draft => draft.languageId === issue.languageId)
    ?.segments.find(item => item.id === issue.segmentId)
  if (!segment) return null
  const from = issue.matched.filter(text => text !== issue.standard)
  return { locked: segment.locked, label: segment.label, plan: planReplacement(segment.content, from, issue.standard, issue.languageId) }
})
watch(previewPlan, (plan) => { if (!plan && previewIssue.value) previewIssue.value = null })

const kindMeta: Record<TermIssue['kind'], { label: string; color: string }> = {
  missing: { label: '漏译', color: 'secondary' },
  former: { label: '旧译', color: 'warning' },
  mixed: { label: '混用', color: 'error' }
}

function langLabel(id: string) { return LANGUAGES.find(item => item.id === id)?.label || id }
function langShort(id: string) { return LANGUAGES.find(item => item.id === id)?.shortLabel || id }
function standardOf(term: Term) { return term.variants.find(variant => variant.kind === 'standard')?.text || '—' }
function formersOf(term: Term) { return term.variants.filter(variant => variant.kind === 'former') }
function hasDraft(languageId: string) { return Boolean(exhibit.value?.drafts.some(draft => draft.languageId === languageId)) }
function formatTime(value: string) {
  return new Date(value).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
}
function issueDetail(issue: TermIssue): string {
  if (issue.kind === 'missing') return `中文原稿已提及，${langLabel(issue.languageId)}稿各段落均未使用标准译法 “${issue.standard}”`
  if (issue.kind === 'former') return `使用旧译 ${issue.matched.map(text => `“${text}”`).join('、')}，应统一为 “${issue.standard}”`
  return `同段混用 ${issue.matched.map(text => `“${text}”`).join(' 与 ')}，应统一为 “${issue.standard}”`
}
function submitTerm() {
  store.addTerm(newTermZh.value, newTermLang.value, newTermText.value)
  newTermZh.value = ''
  newTermText.value = ''
  termDialog.value = false
}
function openAdjust(term: Term) {
  adjustTarget.value = term
  adjustText.value = standardOf(term) === '—' ? '' : standardOf(term)
}
function submitAdjust() {
  if (adjustTarget.value) store.adjustTerm(adjustTarget.value.id, adjustText.value)
  adjustTarget.value = null
}
function applyPreview() {
  const issue = previewIssue.value
  const current = previewPlan.value
  if (!issue || !current || !exhibit.value) return
  const ok = store.applyTermFix({
    exhibitId: exhibit.value.id,
    languageId: issue.languageId,
    segmentId: issue.segmentId,
    termId: issue.termId,
    zh: issue.zh,
    from: current.plan.replaced,
    to: issue.standard,
    afterText: current.plan.afterText
  })
  if (ok) previewIssue.value = null
}
async function copyStandard(issue: TermIssue) {
  try {
    await navigator.clipboard.writeText(issue.standard)
    store.notice = `已复制标准译法“${issue.standard}”。`
  } catch {
    store.notice = `标准译法：${issue.standard}（浏览器限制复制，请手动记录）`
  }
}
</script>

<template>
  <div>
    <v-row>
      <v-col cols="12" lg="5">
        <v-card class="script-card pa-5">
          <div class="d-flex flex-wrap align-center justify-space-between ga-2 mb-2">
            <div class="section-title">术语表</div>
            <v-btn size="small" color="primary" variant="tonal" prepend-icon="mdi-plus" @click="termDialog = true">登记术语</v-btn>
          </div>
          <p class="text-caption text-medium-emphasis mb-3">
            登记中文词与英、日标准译法，适用于全部展厅。调整译法时旧译法自动保留，用于识别稿件中的旧译与混用。
          </p>
          <v-text-field v-model="termFilter" density="compact" hide-details prepend-inner-icon="mdi-magnify" placeholder="筛选术语或译法" aria-label="筛选术语" class="mb-2" />
          <div v-if="!filteredTerms.length" class="text-body-2 text-medium-emphasis py-4">尚未登记术语，点击“登记术语”开始。</div>
          <div v-for="term in filteredTerms" :key="term.id" class="term-row">
            <div class="d-flex align-center flex-wrap ga-2">
              <v-chip size="x-small" color="secondary" variant="tonal">{{ langShort(term.languageId) }}</v-chip>
              <span class="font-weight-medium">{{ term.zh }}</span>
              <span class="text-medium-emphasis">→</span>
              <span class="font-weight-medium">{{ standardOf(term) }}</span>
              <v-spacer />
              <v-btn icon="mdi-swap-horizontal" size="x-small" variant="text" :aria-label="`调整“${term.zh}”的译法`" @click="openAdjust(term)" />
              <v-btn icon="mdi-delete-outline" size="x-small" variant="text" color="error" :aria-label="`删除术语“${term.zh}”`" @click="store.removeTerm(term.id)" />
            </div>
            <div v-if="formersOf(term).length" class="text-caption text-medium-emphasis mt-1">
              旧译保留：
              <v-chip v-for="variant in formersOf(term)" :key="variant.id" size="x-small" variant="outlined" class="me-1 my-1">{{ variant.text }}</v-chip>
            </div>
          </div>
        </v-card>

        <v-card class="script-card pa-5 mt-5">
          <div class="section-title mb-2">处理记录</div>
          <p class="text-caption text-medium-emphasis mb-2">每次确认替换都会记录术语、段落与时间，仅保存在本机浏览器。</p>
          <div v-if="!store.termLogs.length" class="text-body-2 text-medium-emphasis py-2">暂无处理记录。</div>
          <v-list v-else density="compact" class="bg-transparent term-log-list">
            <v-list-item v-for="log in store.termLogs" :key="log.id" class="px-0">
              <v-list-item-title class="text-body-2">「{{ log.zh }}」 “{{ log.from }}” → “{{ log.to }}”</v-list-item-title>
              <v-list-item-subtitle class="text-caption">
                {{ log.exhibitTitle }} · {{ log.segmentLabel || '未命名段落' }} · {{ langShort(log.languageId) }} · {{ formatTime(log.at) }}
              </v-list-item-subtitle>
            </v-list-item>
          </v-list>
        </v-card>
      </v-col>

      <v-col cols="12" lg="7">
        <v-card class="script-card pa-5">
          <div class="section-title">当前展项检查</div>
          <div class="text-h6 font-weight-bold mt-1">{{ exhibit?.title || '未选择展项' }}</div>
          <p class="text-caption text-medium-emphasis mt-1 mb-3">
            按分段段落检查漏译、旧译与一段混用多种译法。结果随正文实时更新；撤销或恢复旧版本后，检查结果同步回到当时内容。
          </p>
          <div class="d-flex flex-wrap ga-2 mb-4" role="status" aria-live="polite">
            <v-chip size="small" color="secondary" variant="tonal">漏译 {{ summary.missing }}</v-chip>
            <v-chip size="small" color="warning" variant="tonal">旧译 {{ summary.former }}</v-chip>
            <v-chip size="small" color="error" variant="tonal">混用 {{ summary.mixed }}</v-chip>
          </div>

          <div v-for="lang in checkLanguages" :key="lang.id" class="mb-5">
            <div class="section-title mb-2">{{ lang.label }}稿</div>
            <p v-if="!hasDraft(lang.id)" class="text-body-2 text-medium-emphasis">该语言尚未建稿，跳过检查。</p>
            <p v-else-if="!groups[lang.id]?.length" class="text-body-2 text-medium-emphasis">未发现术语问题。</p>
            <div v-for="group in groups[lang.id]" :key="group.key" class="term-group mb-3">
              <div class="d-flex align-center flex-wrap ga-2 mb-1">
                <span class="font-weight-medium text-body-2">{{ group.title }}</span>
                <v-chip v-if="group.locked" size="x-small" color="success" variant="tonal">已确认 · 仅提示不写入</v-chip>
              </div>
              <div v-for="issue in group.issues" :key="issue.id" class="term-issue">
                <div class="d-flex align-center flex-wrap ga-2">
                  <v-chip size="x-small" :color="kindMeta[issue.kind].color" variant="flat">{{ kindMeta[issue.kind].label }}</v-chip>
                  <span class="font-weight-medium text-body-2">「{{ issue.zh }}」</span>
                  <span class="text-body-2">{{ issueDetail(issue) }}</span>
                </div>
                <div class="d-flex flex-wrap ga-2 mt-1">
                  <v-btn size="x-small" variant="text" prepend-icon="mdi-crosshairs-gps" @click="emit('locate', issue)">定位</v-btn>
                  <v-btn v-if="issue.kind === 'missing'" size="x-small" variant="text" prepend-icon="mdi-content-copy" @click="copyStandard(issue)">复制标准译法</v-btn>
                  <v-btn v-else size="x-small" variant="tonal" color="primary" prepend-icon="mdi-find-replace" @click="previewIssue = issue">预览替换</v-btn>
                </div>
              </div>
            </div>
          </div>
        </v-card>
      </v-col>
    </v-row>

    <v-dialog v-model="termDialog" max-width="520">
      <v-card class="pa-3">
        <v-card-title>登记术语</v-card-title>
        <v-card-text>
          <v-text-field v-model="newTermZh" label="中文词" hint="如：玉琮" persistent-hint autofocus />
          <v-select v-model="newTermLang" :items="checkLanguages" item-title="label" item-value="id" label="目标语言" class="mt-3" />
          <v-text-field v-model="newTermText" label="标准译法" class="mt-3" @keyup.enter="submitTerm" />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn @click="termDialog = false">取消</v-btn>
          <v-btn color="primary" @click="submitTerm">登记</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog :model-value="Boolean(adjustTarget)" max-width="520" @update:model-value="adjustTarget = null">
      <v-card v-if="adjustTarget" class="pa-3">
        <v-card-title>调整译法 · 「{{ adjustTarget.zh }}」</v-card-title>
        <v-card-text>
          <p class="text-body-2 text-medium-emphasis mb-3">
            当前标准译法 “{{ standardOf(adjustTarget) }}”。保存新译法后，旧译法自动保留，继续用于检查旧译与混用。
          </p>
          <v-text-field v-model="adjustText" label="新的标准译法" autofocus @keyup.enter="submitAdjust" />
          <p v-if="formersOf(adjustTarget).length" class="text-caption text-medium-emphasis mt-2">
            已保留旧译：{{ formersOf(adjustTarget).map(variant => variant.text).join('、') }}
          </p>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn @click="adjustTarget = null">取消</v-btn>
          <v-btn color="primary" @click="submitAdjust">保存译法</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog :model-value="Boolean(previewIssue)" max-width="640" @update:model-value="previewIssue = null">
      <v-card v-if="previewIssue" class="pa-3">
        <v-card-title>预览替换 · 「{{ previewIssue.zh }}」</v-card-title>
        <v-card-text>
          <template v-if="previewPlan">
            <p class="text-body-2 text-medium-emphasis mb-3">
              段落「{{ previewPlan.label || '未命名段落' }}」 · 统一为标准译法 “{{ previewIssue.standard }}”
            </p>
            <v-alert v-if="previewPlan.locked" class="mb-3" type="warning" variant="tonal" density="compact">
              该段落已确认锁定，仅提示，不写入正文。
            </v-alert>
            <div class="section-title mb-1">替换前</div>
            <p class="term-preview">
              <span v-for="(part, index) in previewPlan.plan.before" :key="`before-${index}`" :class="{ 'term-hit': part.hit }">{{ part.text }}</span>
            </p>
            <div class="section-title mb-1 mt-3">替换后</div>
            <p class="term-preview">
              <span v-for="(part, index) in previewPlan.plan.after" :key="`after-${index}`" :class="{ 'term-new': part.hit }">{{ part.text }}</span>
            </p>
            <p v-if="!previewPlan.plan.count" class="text-caption text-medium-emphasis mt-2">段落内容已变化，未找到可替换的旧译。</p>
          </template>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn @click="previewIssue = null">放弃</v-btn>
          <v-btn v-if="previewPlan && !previewPlan.locked" color="primary" :disabled="!previewPlan.plan.count" @click="applyPreview">确认替换</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>
