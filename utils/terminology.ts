import type { LanguageDraft, ReviewField, ReviewIssue, ReviewIssueKind, Segment, Term } from '~/types'

/** 原文中一段命中区间 */
export interface MatchRange {
  start: number
  end: number
  text: string
}

/** 去掉相互重叠的区间，保留靠前、较长的命中（避免标准译法与旧译互相覆盖） */
function uniqueRanges(ranges: MatchRange[]): MatchRange[] {
  const sorted = [...ranges].sort((a, b) => a.start - b.start || b.end - a.end)
  const result: MatchRange[] = []
  for (const range of sorted) {
    const last = result[result.length - 1]
    if (last && range.start < last.end) continue
    result.push(range)
  }
  return result
}

/** 英文：大小写不敏感、按词边界匹配；日文/中文：直接子串匹配 */
export function findRanges(text: string, needle: string, languageId: string): MatchRange[] {
  if (!text || !needle) return []
  const ranges: MatchRange[] = []
  if (languageId === 'en') {
    const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const re = new RegExp(`(?<![A-Za-z])${escaped}(?![A-Za-z])`, 'gi')
    let m: RegExpExecArray | null
    while ((m = re.exec(text))) {
      ranges.push({ start: m.index, end: m.index + m[0].length, text: m[0] })
      if (m[0].length === 0) re.lastIndex++
    }
  } else {
    let from = 0
    while (from <= text.length) {
      const idx = text.indexOf(needle, from)
      if (idx < 0) break
      ranges.push({ start: idx, end: idx + needle.length, text: needle })
      from = idx + needle.length
    }
  }
  return uniqueRanges(ranges)
}

interface Target {
  field: ReviewField
  label: string
  text: string
  segment?: Segment
}

function targetsOf(draft: LanguageDraft): Target[] {
  const targets: Target[] = [
    { field: 'title', label: '展项标题', text: draft.title },
    { field: 'narration', label: '完整讲解词', text: draft.narration },
    { field: 'accessibility', label: '无障碍描述', text: draft.accessibility }
  ]
  draft.segments.forEach((segment, index) => {
    targets.push({ field: 'segment', label: segment.label || `第 ${index + 1} 段`, text: segment.content, segment })
  })
  return targets
}

/**
 * 对一份外语文稿执行术语检查：
 * - missing：中文术语出现在外文中且该位置没有任何标准/旧译 → 漏译
 * - legacy：命中旧译法
 * - mixed：同一字段/段落里同一条术语出现两种及以上不同写法（含标准译）
 */
export function runCheck(draft: LanguageDraft, terms: Term[]): ReviewIssue[] {
  const issues: ReviewIssue[] = []
  let seq = 0
  const makeId = () => `issue-${Date.now()}-${seq++}`

  for (const target of targetsOf(draft)) {
    for (const term of terms) {
      const standard = draft.languageId === 'en' ? term.en : term.ja
      const legacy = draft.languageId === 'en' ? term.legacyEn : term.legacyJa
      if (!term.zh || !standard) continue

      const standardRanges = findRanges(target.text, standard, draft.languageId)
      const legacyRanges = uniqueRanges(legacy.flatMap(item => findRanges(target.text, item, draft.languageId)))
      const zhRanges = findRanges(target.text, term.zh, draft.languageId)
        // 与标准译/旧译重叠的中文命中属于误报（如日文里的汉字本就是标准译）
        .filter(r => ![...standardRanges, ...legacyRanges].some(o => r.start >= o.start && r.end <= o.end))

      const forms = new Set<string>()
      standardRanges.forEach(r => forms.add(r.text))
      legacyRanges.forEach(r => forms.add(r.text))

      zhRanges.forEach((range) => {
        issues.push({
          id: makeId(), termId: term.id, zh: term.zh, kind: 'missing',
          field: target.field, segmentId: target.segment?.id, locationLabel: target.label,
          start: range.start, end: range.end, matched: range.text,
          replacement: standard, locked: Boolean(target.segment?.locked)
        })
      })

      legacyRanges.forEach((range) => {
        issues.push({
          id: makeId(), termId: term.id, zh: term.zh, kind: 'legacy',
          field: target.field, segmentId: target.segment?.id, locationLabel: target.label,
          start: range.start, end: range.end, matched: range.text,
          replacement: standard, locked: Boolean(target.segment?.locked),
          forms: forms.size > 1 ? Array.from(forms) : undefined
        })
      })

      if (forms.size > 1 && !target.segment?.locked) {
        // 混用是段落级提示：取该段最早的一次命中用于定位
        const earliest = [...standardRanges, ...legacyRanges].sort((a, b) => a.start - b.start)[0]
        issues.push({
          id: makeId(), termId: term.id, zh: term.zh, kind: 'mixed',
          field: target.field, segmentId: target.segment?.id, locationLabel: target.label,
          start: earliest.start, end: earliest.end, matched: earliest.text,
          replacement: standard, locked: false, forms: Array.from(forms)
        })
      }
    }
  }

  // 同一段内的漏译/旧译问题按位置排序，混用提示附在段落末尾
  return issues.sort((a, b) => {
    if (a.field !== b.field) return a.field.localeCompare(b.field)
    if ((a.segmentId || '') !== (b.segmentId || '')) return (a.segmentId || '').localeCompare(b.segmentId || '')
    if (a.kind === 'mixed') return 1
    if (b.kind === 'mixed') return -1
    return a.start - b.start
  })
}

/** 命中区间的可视片段 */
export interface PreviewPart {
  text: string
  marked?: boolean
}

/** 把问题命中区间切成原文片段，供高亮预览 */
export function buildParts(text: string, ranges: Array<{ start: number; end: number }>): PreviewPart[] {
  const parts: PreviewPart[] = []
  let cursor = 0
  for (const range of uniqueRanges(ranges.map(r => ({ ...r, text: text.slice(r.start, r.end) })))) {
    if (range.start > cursor) parts.push({ text: text.slice(cursor, range.start) })
    parts.push({ text: text.slice(range.start, range.end), marked: true })
    cursor = range.end
  }
  if (cursor < text.length) parts.push({ text: text.slice(cursor) })
  return parts
}

/** 保留原文大小写风格：句首大写跟随原词 */
function preserveCase(original: string, replacement: string): string {
  if (!original) return replacement
  if (original[0] === original[0].toUpperCase() && original[0] !== original[0].toLowerCase()) {
    return replacement[0].toUpperCase() + replacement.slice(1)
  }
  return replacement
}

/**
 * 在文本中按区间倒序替换，返回新文本。
 * 锁定段落、漏译问题不会进入可替换集合（调用方负责过滤）。
 */
export function applyReplacements(
  text: string,
  issues: Array<ReviewIssue & { replacement: string }>
): string {
  const ranges = uniqueRanges(issues
    .filter(i => i.end <= text.length && i.start >= 0)
    .map(i => ({ start: i.start, end: i.end, text: preserveCase(text.slice(i.start, i.end), i.replacement) })))
  let result = text
  for (const range of [...ranges].sort((a, b) => b.start - a.start)) {
    result = result.slice(0, range.start) + range.text + result.slice(range.end)
  }
  return result
}

export function issueKindLabel(kind: ReviewIssueKind): string {
  return ({ missing: '漏译', legacy: '旧译', mixed: '混用' })[kind]
}
