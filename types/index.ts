export type ScriptStatus = 'draft' | 'review' | 'returned' | 'approved'
export type DeviceKind = 'desktop' | 'tablet' | 'mobile' | 'kiosk'

export interface Hall {
  id: string
  name: string
  description: string
}

export interface Segment {
  id: string
  label: string
  content: string
  locked: boolean
}

export interface LanguageDraft {
  id: string
  languageId: string
  title: string
  narration: string
  accessibility: string
  durationMinutes: number
  sources: string
  status: ScriptStatus
  segments: Segment[]
  updatedAt: string
}

export interface Exhibit {
  id: string
  hallId: string
  code: string
  title: string
  order: number
  drafts: LanguageDraft[]
}

export interface Language {
  id: string
  code: string
  label: string
  shortLabel: string
}

// —— 术语审校 ——

/** 术语条目：中文词与英日标准译法，旧译法始终保留用于审校提示 */
export interface Term {
  id: string
  zh: string
  en: string
  ja: string
  /** 英文旧译法（调整标准译法时自动沉淀于此，也可手动登记） */
  legacyEn: string[]
  /** 日文旧译法 */
  legacyJa: string[]
  createdAt: string
  updatedAt: string
}

export type ReviewIssueKind = 'missing' | 'legacy' | 'mixed'
export type ReviewField = 'title' | 'narration' | 'accessibility' | 'segment'

/** 单条审校问题：定位到具体字段/段落与字符区间 */
export interface ReviewIssue {
  id: string
  termId: string
  /** 中文术语，便于日志与展示 */
  zh: string
  /** 漏译 / 旧译 / 混用 */
  kind: ReviewIssueKind
  field: ReviewField
  segmentId?: string
  /** 段落或字段的展示名称 */
  locationLabel: string
  /** 命中区间（相对该字段文本） */
  start: number
  end: number
  /** 命中的实际文字 */
  matched: string
  /** 建议替换成的标准译法（旧译问题可用） */
  replacement?: string
  /** 混用问题中同一段出现的各种译法 */
  forms?: string[]
  /** 命中已确认（锁定）段落时为 true：只提示，不写入 */
  locked: boolean
}

/** 某个展项 + 语言的一次检查结果 */
export interface ReviewCheck {
  id: string
  exhibitId: string
  languageId: string
  createdAt: string
  issues: ReviewIssue[]
  /** 手动标记“仅提示”的问题 id */
  ignoredIssueIds: string[]
}

export interface ReviewLog {
  id: string
  time: string
  action: '登记术语' | '调整术语' | '删除术语' | '运行检查' | '应用替换' | '忽略问题' | '放弃检查' | '恢复版本'
  detail: string
  termZh?: string
  exhibitCode?: string
  location?: string
}

/** 定位请求：术语审校 → 脚本编辑中滚动并高亮 */
export interface ReviewFocus {
  field: ReviewField
  segmentId?: string
  at: number
}

export interface VersionSnapshot {
  id: string
  exhibitId: string
  languageId: string
  name: string
  createdAt: string
  draft: LanguageDraft
  /** 快照时刻冻结的术语检查结果，恢复版本时一并回到当时 */
  reviewCheckedAt?: string
  reviewIssues?: ReviewIssue[]
}

export interface PersistedState {
  halls: Hall[]
  exhibits: Exhibit[]
  versions: VersionSnapshot[]
  terms: Term[]
  reviewChecks: ReviewCheck[]
  reviewLogs: ReviewLog[]
  selectedHallId: string
  selectedExhibitId: string
  selectedLanguageId: string
  lastSavedAt: string
}

export interface DiffLine {
  type: 'same' | 'add' | 'remove'
  text: string
}
