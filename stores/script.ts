import { defineStore } from 'pinia'
import type { Exhibit, Hall, Language, LanguageDraft, PersistedState, ReviewCheck, ReviewFocus, ReviewIssue, ReviewLog, ScriptStatus, Segment, Term, VersionSnapshot } from '~/types'
import { applyReplacements, runCheck } from '~/utils/terminology'

export const LANGUAGES: Language[] = [
  { id: 'zh', code: 'zh-CN', label: '简体中文', shortLabel: '中' },
  { id: 'en', code: 'en-US', label: 'English', shortLabel: 'EN' },
  { id: 'ja', code: 'ja-JP', label: '日本語', shortLabel: '日' }
]

const STORAGE_KEY = 'museum-script-studio-v2'
const LEGACY_STORAGE_KEY = 'museum-script-studio-v1'

const segments = (prefix: string, values: Array<[string, string, boolean?]>): Segment[] => values.map(([label, content, locked], index) => ({
  id: `${prefix}-${index + 1}`,
  label,
  content,
  locked: Boolean(locked)
}))

function seedTerms(): Term[] {
  const now = '2026-09-20T01:00:00.000Z'
  return [
    {
      id: 'term-cong', zh: '玉琮', en: 'jade cong', ja: '玉琮',
      legacyEn: ['jade tube'], legacyJa: ['玉製の琮'],
      createdAt: now, updatedAt: now
    },
    {
      id: 'term-liangzhu', zh: '良渚', en: 'Liangzhu', ja: '良渚',
      legacyEn: ['Liang-chu', 'Liangzhu culture'], legacyJa: ['良渚文化'],
      createdAt: now, updatedAt: now
    },
    {
      id: 'term-jue', zh: '青铜爵', en: 'bronze jue', ja: '青銅爵',
      legacyEn: ['bronze wine cup', 'jue cup'], legacyJa: ['爵'],
      createdAt: now, updatedAt: now
    }
  ]
}

function demoState(): PersistedState {
  const halls: Hall[] = [
    { id: 'hall-ancient', name: '文明肇始厅', description: '史前至先秦文明，共 18 个展项' },
    { id: 'hall-silk', name: '丝路交融厅', description: '丝绸之路上的器物、信仰与生活' },
    { id: 'hall-city', name: '城市记忆厅', description: '近现代城市空间与市民生活' }
  ]
  const exhibits: Exhibit[] = [
    {
      id: 'exhibit-jade', hallId: 'hall-ancient', code: 'A-03', title: '玉琮：沟通天地的礼器', order: 3,
      drafts: [
        {
          id: 'draft-jade-zh', languageId: 'zh', title: '玉琮：沟通天地的礼器',
          narration: '这件玉琮出土于长江下游的良渚遗址。它外方内圆，四角雕刻神人兽面纹，体现了新石器时代晚期精湛的玉器工艺。',
          accessibility: '玉琮为深青色，高约二十厘米。触摸模型可感受方形四角与中央圆孔；圆孔贯穿器身。',
          durationMinutes: 2.5, sources: '《中国玉器全集》第一卷；本馆藏品档案 1987-J-042',
          status: 'approved', updatedAt: '2026-09-23T08:35:00.000Z',
          segments: segments('jade-zh', [
            ['开场定位', '这件玉琮来自距今约五千年的良渚文化。', true],
            ['器物观察', '它外方内圆，四角雕刻神人兽面纹。', true],
            ['文化含义', '玉琮常被看作沟通天地的礼器，也象征权力与身份。'],
            ['参观提示', '请沿展柜顺时针观察，触摸复制品前先使用免洗消毒液。']
          ])
        },
        {
          id: 'draft-jade-en', languageId: 'en', title: 'Jade Cong: A Ritual Object Between Heaven and Earth',
          narration: 'This jade cong was made by the Liangzhu culture. Its square exterior and circular bore embody an early Chinese vision of the cosmos.',
          accessibility: 'The object is dark green. A tactile model shows four corners, carved faces, and a central circular opening.',
          durationMinutes: 2.3, sources: 'Complete Collection of Chinese Jades, Vol. 1; Museum accession 1987-J-042',
          status: 'review', updatedAt: '2026-09-24T02:15:00.000Z',
          segments: segments('jade-en', [
            ['Introduction', 'This jade cong is about five thousand years old.', true],
            ['Visual description', 'A jade tube encloses a circular opening, while jade cong motifs cover the corners.'],
            ['Meaning', 'Jade cong is understood as a ritual link between heaven and earth.']
          ])
        },
        {
          id: 'draft-jade-ja', languageId: 'ja', title: '玉琮：天と地を結ぶ礼器',
          narration: 'こちらは良渚文化の玉琮です。外側は方形、中央は円形で、四隅には神人獣面文が刻まれています。',
          accessibility: '暗い青緑色の玉製です。複製模型では四つの角と中央の円孔を触って確認できます。',
          durationMinutes: 2.6, sources: '『中国玉器全集』第一巻；収蔵資料 1987-J-042',
          status: 'draft', updatedAt: '2026-09-21T06:10:00.000Z',
          segments: segments('jade-ja', [
            ['導入', '約五千年前の良渚文化を代表する玉琮です。'],
            ['観察', '外側は方形、中央は円形で、四隅に精緻な文様があります。'],
            ['意味', '天地を結ぶ礼器として、力と身分を象徴しました。']
          ])
        }
      ]
    },
    {
      id: 'exhibit-bronze', hallId: 'hall-ancient', code: 'A-08', title: '青铜爵与礼制', order: 8,
      drafts: [
        {
          id: 'draft-bronze-zh', languageId: 'zh', title: '青铜爵与礼制',
          narration: '爵是最早的青铜酒器之一。三足稳定器身，长流便于倾倒，柱饰则与商周礼仪密切相关。',
          accessibility: '器物为青铜色，器口一侧有长流，底部三足支撑。复制件配有可触摸的局部纹样。',
          durationMinutes: 3, sources: '《殷周青铜器通论》；展品说明卡 A-08',
          status: 'returned', updatedAt: '2026-09-23T11:20:00.000Z',
          segments: segments('bronze-zh', [
            ['器物介绍', '这是一件商代青铜爵，用于温酒和饮酒。'],
            ['结构说明', '三足使器身稳定，前端的流便于倾倒。'],
            ['礼制背景', '青铜器数量与形制反映了使用者的身份。'],
            ['修改说明', '审校意见：补充“柱饰”的用途，并核对年代。']
          ])
        },
        {
          id: 'draft-bronze-en', languageId: 'en', title: 'Bronze Jue and Ritual Order',
          narration: 'The jue was among the earliest bronze drinking vessels. Its tripod base, pouring spout, and posts were closely tied to Shang and Zhou ritual.',
          accessibility: 'The tactile replica includes the long spout, tripod feet, and raised posts.',
          durationMinutes: 2.8, sources: 'A General Survey of Yin-Zhou Bronzes; Gallery label A-08',
          status: 'draft', updatedAt: '2026-09-22T09:00:00.000Z',
          segments: segments('bronze-en', [['Object', 'This bronze jue dates to the Shang dynasty.'], ['Structure', 'Three legs support the body; the long spout guides the pour.']])
        }
      ]
    },
    {
      id: 'exhibit-silk', hallId: 'hall-silk', code: 'B-02', title: '织机与丝路纹样', order: 2,
      drafts: [{
        id: 'draft-silk-zh', languageId: 'zh', title: '织机与丝路纹样',
        narration: '织机把一根根丝线组织成布匹，也把不同地区的图案与故事连接在一起。',
        accessibility: '体验区提供放大纹样、凸点经纬结构以及可操作的小型织机模型。',
        durationMinutes: 4, sources: '馆内教育活动资料；丝绸之路纺织史专题',
        status: 'draft', updatedAt: '2026-09-20T03:00:00.000Z',
        segments: segments('silk-zh', [['序言', '丝绸不只是一种材料，也是交流的媒介。'], ['互动', '请试着推动梭子，观察经纬线如何交会。']])
      }]
    }
  ]
  return {
    halls,
    exhibits,
    versions: [],
    terms: seedTerms(),
    reviewChecks: [],
    reviewLogs: [],
    selectedHallId: halls[0].id,
    selectedExhibitId: exhibits[0].id,
    selectedLanguageId: 'zh',
    lastSavedAt: new Date().toISOString()
  }
}

export const useScriptStore = defineStore('museum-script', {
  state: () => ({
    halls: [] as Hall[],
    exhibits: [] as Exhibit[],
    versions: [] as VersionSnapshot[],
    terms: [] as Term[],
    reviewChecks: [] as ReviewCheck[],
    reviewLogs: [] as ReviewLog[],
    selectedHallId: '',
    selectedExhibitId: '',
    selectedLanguageId: 'zh',
    lastSavedAt: '',
    hydrated: false,
    past: [] as string[],
    future: [] as string[],
    notice: '',
    reviewFocus: null as ReviewFocus | null,
    /** 恢复版本后冻结该展项语言的自动检查，避免覆盖快照当时的结果 */
    frozenReviewScope: ''
  }),
  getters: {
    selectedHall(state): Hall | undefined {
      return state.halls.find(hall => hall.id === state.selectedHallId)
    },
    hallExhibits(state): Exhibit[] {
      return state.exhibits.filter(exhibit => exhibit.hallId === state.selectedHallId).sort((a, b) => a.order - b.order)
    },
    selectedExhibit(state): Exhibit | undefined {
      return state.exhibits.find(exhibit => exhibit.id === state.selectedExhibitId)
    },
    selectedDraft(): LanguageDraft | undefined {
      return this.selectedExhibit?.drafts.find(draft => draft.languageId === this.selectedLanguageId)
    },
    currentReviewCheck(state): ReviewCheck | undefined {
      return state.reviewChecks
        .filter(item => item.exhibitId === state.selectedExhibitId && item.languageId === state.selectedLanguageId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
    },
    wordCount(): number {
      return (this.selectedDraft?.narration || '').replace(/\s/g, '').length
    },
    canUndo(state): boolean { return state.past.length > 0 },
    canRedo(state): boolean { return state.future.length > 0 }
  },
  actions: {
    hydrate() {
      if (this.hydrated || typeof localStorage === 'undefined') return
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        try {
          const data = JSON.parse(saved) as PersistedState
          this.$patch({ ...data, terms: data.terms || [], reviewChecks: data.reviewChecks || [], reviewLogs: data.reviewLogs || [], hydrated: true })
          if (!this.halls.length || !this.exhibits.length) this.resetDemo()
        } catch {
          this.resetDemo()
        }
      } else {
        // 首次升级到术语审校版本：保留旧版本地稿件，补齐术语数据
        const legacy = localStorage.getItem(LEGACY_STORAGE_KEY)
        if (legacy) {
          try {
            const data = JSON.parse(legacy) as PersistedState
            this.$patch({ ...data, terms: seedTerms(), reviewChecks: [], reviewLogs: [], hydrated: true })
            this.persist()
          } catch {
            this.resetDemo()
          }
        } else {
          this.resetDemo()
        }
      }
      this.ensureSelection()
      this.hydrated = true
    },
    resetDemo() {
      this.$patch({ ...demoState(), hydrated: true, past: [], future: [], reviewFocus: null })
      this.persist()
      this.notice = '示例数据已就绪，可直接开始编辑。'
    },
    snapshot(): string {
      return JSON.stringify({
        halls: this.halls, exhibits: this.exhibits, versions: this.versions,
        terms: this.terms, reviewChecks: this.reviewChecks, reviewLogs: this.reviewLogs
      })
    },
    commit(mutator: () => void) {
      this.past.push(this.snapshot())
      if (this.past.length > 50) this.past.shift()
      this.future = []
      mutator()
      this.lastSavedAt = new Date().toISOString()
      this.persist()
    },
    persist() {
      if (typeof localStorage === 'undefined') return
      const data: PersistedState = {
        halls: this.halls, exhibits: this.exhibits, versions: this.versions,
        terms: this.terms, reviewChecks: this.reviewChecks, reviewLogs: this.reviewLogs,
        selectedHallId: this.selectedHallId, selectedExhibitId: this.selectedExhibitId,
        selectedLanguageId: this.selectedLanguageId, lastSavedAt: this.lastSavedAt
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
    },
    ensureSelection() {
      if (!this.halls.some(hall => hall.id === this.selectedHallId)) this.selectedHallId = this.halls[0]?.id || ''
      const inHall = this.exhibits.filter(exhibit => exhibit.hallId === this.selectedHallId)
      if (!inHall.some(exhibit => exhibit.id === this.selectedExhibitId)) this.selectedExhibitId = inHall[0]?.id || ''
      const exhibit = this.selectedExhibit
      if (!exhibit?.drafts.some(draft => draft.languageId === this.selectedLanguageId)) this.selectedLanguageId = exhibit?.drafts[0]?.languageId || 'zh'
    },
    selectHall(id: string) {
      this.frozenReviewScope = ''
      this.selectedHallId = id
      const exhibit = this.exhibits.find(item => item.hallId === id)
      this.selectedExhibitId = exhibit?.id || ''
      this.ensureSelection()
      this.persist()
    },
    selectExhibit(id: string) {
      this.frozenReviewScope = ''
      this.selectedExhibitId = id
      this.ensureSelection()
      this.persist()
    },
    selectLanguage(id: string) {
      this.frozenReviewScope = ''
      this.selectedLanguageId = id
      this.persist()
    },
    updateDraft(patch: Partial<Pick<LanguageDraft, 'title' | 'narration' | 'accessibility' | 'durationMinutes' | 'sources'>>) {
      const draft = this.selectedDraft
      if (!draft) return
      this.commit(() => Object.assign(draft, patch, { updatedAt: new Date().toISOString() }))
      this.notice = '改动已自动保存到浏览器。'
    },
    updateSegment(id: string, patch: Partial<Pick<Segment, 'label' | 'content'>>) {
      const segment = this.selectedDraft?.segments.find(item => item.id === id)
      if (!segment || segment.locked) return
      this.commit(() => Object.assign(segment, patch))
    },
    toggleLock(id: string) {
      const segment = this.selectedDraft?.segments.find(item => item.id === id)
      if (!segment) return
      this.commit(() => { segment.locked = !segment.locked })
      this.notice = segment.locked ? '段落已锁定，避免误改。' : '段落已解锁。'
    },
    addSegment() {
      const draft = this.selectedDraft
      if (!draft) return
      this.commit(() => draft.segments.push({ id: `segment-${Date.now()}`, label: `新段落 ${draft.segments.length + 1}`, content: '', locked: false }))
    },
    removeSegment(id: string) {
      const draft = this.selectedDraft
      const segment = draft?.segments.find(item => item.id === id)
      if (!draft || !segment || segment.locked) return
      this.commit(() => { draft.segments = draft.segments.filter(item => item.id !== id) })
    },
    setStatus(status: ScriptStatus) {
      const draft = this.selectedDraft
      if (!draft) return
      this.commit(() => { draft.status = status; draft.updatedAt = new Date().toISOString() })
      this.notice = `状态已更新为“${this.statusLabel(status)}”。`
    },
    statusLabel(status: ScriptStatus) {
      return ({ draft: '草稿', review: '待审', returned: '退回', approved: '已定稿' })[status]
    },
    createVersion(name?: string) {
      const draft = this.selectedDraft
      if (!draft) return
      const check = this.currentReviewCheck
      const version: VersionSnapshot = {
        id: `version-${Date.now()}`,
        exhibitId: this.selectedExhibitId,
        languageId: this.selectedLanguageId,
        name: name || `${new Date().toLocaleString('zh-CN', { hour12: false })} 快照`,
        createdAt: new Date().toISOString(),
        draft: JSON.parse(JSON.stringify(draft)),
        reviewCheckedAt: check?.createdAt,
        reviewIssues: check ? JSON.parse(JSON.stringify(check.issues)) : []
      }
      this.commit(() => this.versions.unshift(version))
      this.notice = '已保存当前版本，可在版本页比较或恢复。'
    },
    restoreVersion(id: string) {
      const version = this.versions.find(item => item.id === id)
      if (!version) return
      const frozenIssues: ReviewIssue[] = version.reviewIssues ? JSON.parse(JSON.stringify(version.reviewIssues)) : []
      this.commit(() => {
        const exhibit = this.exhibits.find(item => item.id === version.exhibitId)
        if (!exhibit) return
        const index = exhibit.drafts.findIndex(item => item.languageId === version.languageId)
        const restored = JSON.parse(JSON.stringify(version.draft)) as LanguageDraft
        if (index >= 0) exhibit.drafts[index] = restored
        else exhibit.drafts.push(restored)
        // 检查结果回到快照当时：同一展项语言的后续检查结果移除，补入冻结结果
        this.reviewChecks = this.reviewChecks.filter(item => !(item.exhibitId === version.exhibitId && item.languageId === version.languageId))
        if (version.reviewCheckedAt && frozenIssues.length >= 0) {
          this.reviewChecks.unshift({
            id: `check-frozen-${version.id}`,
            exhibitId: version.exhibitId,
            languageId: version.languageId,
            createdAt: version.reviewCheckedAt,
            issues: frozenIssues,
            ignoredIssueIds: []
          })
        }
        this.pushReviewLog('恢复版本', `恢复版本“${version.name}”，检查结果回到 ${new Date(version.createdAt).toLocaleString('zh-CN', { hour12: false })} 时的内容`, exhibit.code)
      })
      this.selectedExhibitId = version.exhibitId
      this.selectedLanguageId = version.languageId
      this.frozenReviewScope = `${version.exhibitId}:${version.languageId}`
      this.notice = '版本已恢复，术语检查结果也回到该版本当时；本次恢复可撤销。'
    },
    undo() {
      const state = this.past.pop()
      if (!state) return
      this.future.push(this.snapshot())
      this.$patch(JSON.parse(state))
      this.lastSavedAt = new Date().toISOString()
      this.ensureSelection()
      this.persist()
      this.notice = '已撤销上一步。'
    },
    redo() {
      const state = this.future.pop()
      if (!state) return
      this.past.push(this.snapshot())
      this.$patch(JSON.parse(state))
      this.lastSavedAt = new Date().toISOString()
      this.ensureSelection()
      this.persist()
      this.notice = '已重做。'
    },
    completionFor(exhibit: Exhibit, languageId: string): number {
      const draft = exhibit.drafts.find(item => item.languageId === languageId)
      if (!draft) return 0
      const checks = [draft.title, draft.narration, draft.accessibility, draft.sources, draft.segments.length > 0 ? 'segments' : '']
      return Math.round(checks.filter(Boolean).length / checks.length * 100)
    },

    // —— 术语审校 ——

    pushReviewLog(action: ReviewLog['action'], detail: string, exhibitCode?: string, termZh?: string, location?: string) {
      this.reviewLogs.unshift({
        id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        time: new Date().toISOString(),
        action, detail, termZh, exhibitCode, location
      })
      if (this.reviewLogs.length > 300) this.reviewLogs.length = 300
    },
    saveTerm(input: { id?: string; zh: string; en: string; ja: string; legacyEn: string; legacyJa: string }) {
      const zh = input.zh.trim()
      if (!zh) { this.notice = '中文术语不能为空。'; return }
      const parse = (raw: string) => raw.split(/[;,；，\n]/).map(item => item.trim()).filter(Boolean)
      const draft = this.selectedDraft
      const exhibit = this.selectedExhibit
      const existing = input.id ? this.terms.find(item => item.id === input.id) : this.terms.find(item => item.zh === zh)
      const now = new Date().toISOString()
      this.commit(() => {
        if (existing) {
          // 调整标准译法时，把旧标准译法保留下来，仍用于审校旧译提示
          const legacyEn = Array.from(new Set([...parse(input.legacyEn), ...(input.en.trim() && input.en.trim() !== existing.en && existing.en ? [existing.en] : [])]))
          const legacyJa = Array.from(new Set([...parse(input.legacyJa), ...(input.ja.trim() && input.ja.trim() !== existing.ja && existing.ja ? [existing.ja] : [])]))
          Object.assign(existing, { zh, en: input.en.trim(), ja: input.ja.trim(), legacyEn, legacyJa, updatedAt: now })
          this.pushReviewLog('调整术语', `术语“${zh}”标准译法已更新，旧译法保留 ${legacyEn.length + legacyJa.length} 条`, exhibit?.code, zh)
        } else {
          this.terms.push({
            id: `term-${Date.now()}`, zh, en: input.en.trim(), ja: input.ja.trim(),
            legacyEn: parse(input.legacyEn), legacyJa: parse(input.legacyJa),
            createdAt: now, updatedAt: now
          })
          this.pushReviewLog('登记术语', `登记术语“${zh}”（英：${input.en.trim() || '未填'}；日：${input.ja.trim() || '未填'}）`, exhibit?.code, zh)
        }
      })
      this.notice = existing ? `术语“${zh}”已调整，旧译法继续保留。` : `术语“${zh}”已登记。`
    },
    removeTerm(id: string) {
      const term = this.terms.find(item => item.id === id)
      if (!term) return
      this.commit(() => {
        this.terms = this.terms.filter(item => item.id !== id)
        this.pushReviewLog('删除术语', `删除术语“${term.zh}”及其译法记录`, this.selectedExhibit?.code, term.zh)
      })
      this.notice = `术语“${term.zh}”已删除。`
    },
    /** 打开展项/语言时自动执行：只更新检查结果，不写日志、不入撤销栈 */
    autoRunReviewCheck() {
      const draft = this.selectedDraft
      if (!draft || draft.languageId === 'zh' || !this.terms.length) return
      if (this.frozenReviewScope === `${this.selectedExhibitId}:${this.selectedLanguageId}`) return
      const issues = runCheck(draft, this.terms)
      const previous = this.currentReviewCheck
      this.reviewChecks = this.reviewChecks.filter(item => !(item.exhibitId === this.selectedExhibitId && item.languageId === this.selectedLanguageId))
      this.reviewChecks.unshift({
        id: `check-${Date.now()}-auto`,
        exhibitId: this.selectedExhibitId,
        languageId: this.selectedLanguageId,
        createdAt: new Date().toISOString(),
        issues,
        ignoredIssueIds: previous?.ignoredIssueIds || []
      })
      this.persist()
    },
    runReviewCheck() {
      const draft = this.selectedDraft
      const exhibit = this.selectedExhibit
      if (!draft) return
      if (draft.languageId === 'zh') { this.notice = '中文原稿不需要术语检查，请切换到英文或日文。'; return }
      if (!this.terms.length) { this.notice = '请先在术语表登记中文词与英日标准译法。'; return }
      this.frozenReviewScope = ''
      const issues = runCheck(draft, this.terms)
      this.commit(() => {
        this.reviewChecks = this.reviewChecks.filter(item => !(item.exhibitId === this.selectedExhibitId && item.languageId === this.selectedLanguageId))
        this.reviewChecks.unshift({
          id: `check-${Date.now()}`,
          exhibitId: this.selectedExhibitId,
          languageId: this.selectedLanguageId,
          createdAt: new Date().toISOString(),
          issues,
          ignoredIssueIds: []
        })
        this.pushReviewLog('运行检查', `检查 ${draft.languageId === 'en' ? '英文' : '日文'} 文稿，发现 ${issues.length} 处问题`, exhibit?.code)
      })
      this.notice = `检查完成：漏译 ${issues.filter(i => i.kind === 'missing').length} 处，旧译 ${issues.filter(i => i.kind === 'legacy').length} 处，混用 ${issues.filter(i => i.kind === 'mixed').length} 处。`
    },
    /** 放弃检查：仅清掉本次检查结果，正文不动 */
    dismissReviewCheck() {
      const check = this.currentReviewCheck
      const exhibit = this.selectedExhibit
      if (!check) return
      this.commit(() => {
        this.reviewChecks = this.reviewChecks.filter(item => item.id !== check.id)
        this.pushReviewLog('放弃检查', '放弃本次检查结果，正文未改动', exhibit?.code)
      })
      this.notice = '已放弃检查结果，正文未做任何改动。'
    },
    ignoreIssue(issueId: string) {
      const check = this.currentReviewCheck
      const issue = check?.issues.find(item => item.id === issueId)
      if (!check || !issue) return
      this.commit(() => {
        if (!check.ignoredIssueIds.includes(issueId)) check.ignoredIssueIds.push(issueId)
        this.pushReviewLog('忽略问题', `标记“${issue.zh}”${issue.locationLabel}的${issue.kind === 'missing' ? '漏译' : issue.kind === 'legacy' ? '旧译' : '混用'}为仅提示`, this.selectedExhibit?.code, issue.zh, issue.locationLabel)
      })
      this.notice = '已标记为仅提示，不会被批量替换。'
    },
    /** 请求跳转到编辑器对应位置（不修改内容） */
    locateIssue(issue: ReviewIssue) {
      this.reviewFocus = { field: issue.field, segmentId: issue.segmentId, at: Date.now() }
    },
    /** 按问题 id 应用替换；漏译与已确认（锁定）段落仅提示，不会写入 */
    applyReviewFixes(issueIds: string[]) {
      const draft = this.selectedDraft
      const check = this.currentReviewCheck
      const exhibit = this.selectedExhibit
      if (!draft || !check) return
      const wanted = new Set(issueIds)
      const applicable = check.issues.filter(issue =>
        wanted.has(issue.id) && !check.ignoredIssueIds.includes(issue.id) &&
        issue.replacement && !issue.locked && issue.kind !== 'missing')

      if (!applicable.length) {
        this.notice = '所选问题无需写入：漏译请人工翻译，已确认段落只提示不写入。'
        return
      }

      const byTarget = new Map<string, ReviewIssue[]>()
      for (const issue of applicable) {
        const key = issue.field === 'segment' ? `segment:${issue.segmentId}` : issue.field
        const list = byTarget.get(key) || []
        list.push(issue)
        byTarget.set(key, list)
      }

      const termNames = Array.from(new Set(applicable.map(i => i.zh)))
      const skippedLocked = check.issues.filter(i => wanted.has(i.id) && i.locked).length
      this.frozenReviewScope = ''
      this.commit(() => {
        for (const [key, list] of byTarget) {
          if (key === 'title') { draft.title = applyReplacements(draft.title, list as Array<ReviewIssue & { replacement: string }>) }
          else if (key === 'narration') { draft.narration = applyReplacements(draft.narration, list as Array<ReviewIssue & { replacement: string }>) }
          else if (key === 'accessibility') { draft.accessibility = applyReplacements(draft.accessibility, list as Array<ReviewIssue & { replacement: string }>) }
          else if (key.startsWith('segment:')) {
            const segment = draft.segments.find(item => item.id === key.slice(8))
            if (segment && !segment.locked) segment.content = applyReplacements(segment.content, list as Array<ReviewIssue & { replacement: string }>)
          }
        }
        draft.updatedAt = new Date().toISOString()
        for (const issue of applicable) {
          this.pushReviewLog('应用替换', `“${issue.matched}” → “${issue.replacement}”`, exhibit?.code, issue.zh, issue.locationLabel)
        }
        // 替换后重新检查，让段落状态即时更新
        const issues = runCheck(draft, this.terms)
        this.reviewChecks = this.reviewChecks.filter(item => item.id !== check.id)
        this.reviewChecks.unshift({ id: `check-${Date.now()}-after-fix`, exhibitId: this.selectedExhibitId, languageId: this.selectedLanguageId, createdAt: new Date().toISOString(), issues, ignoredIssueIds: [] })
      })
      this.notice = `已把 ${applicable.length} 处替换写入正文（涉及术语：${termNames.join('、')}）。${skippedLocked ? `另有 ${skippedLocked} 处在已确认段落，仅提示未写入。` : ''}`
    }
  }
})
