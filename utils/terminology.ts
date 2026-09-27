import type { Exhibit, Term, TermIssue } from '~/types'

export interface VariantMatch {
  text: string
  start: number
  end: number
}

export interface TextPart {
  text: string
  hit: boolean
}

export interface ReplacementPlan {
  before: TextPart[]
  after: TextPart[]
  afterText: string
  count: number
  replaced: string[]
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// 英文译法按词边界匹配，避免 “bronze jue” 误中 “bronze jue cup”；中日文按字面包含
function matcherFor(text: string, languageId: string): RegExp {
  const source = escapeRegExp(text)
  return languageId === 'en'
    ? new RegExp(`(?<![A-Za-z])${source}(?![A-Za-z])`, 'gi')
    : new RegExp(source, 'g')
}

// 长译法优先、互不重叠地找出段落里出现的译法
export function findVariantMatches(content: string, texts: string[], languageId: string): VariantMatch[] {
  const ordered = [...new Set(texts.filter(Boolean))].sort((a, b) => b.length - a.length)
  const taken: Array<[number, number]> = []
  const matches: VariantMatch[] = []
  for (const text of ordered) {
    const regex = matcherFor(text, languageId)
    let hit: RegExpExecArray | null
    while ((hit = regex.exec(content)) !== null) {
      const start = hit.index
      const end = start + hit[0].length
      if (taken.some(([s, e]) => start < e && end > s)) continue
      taken.push([start, end])
      matches.push({ text, start, end })
    }
  }
  return matches.sort((a, b) => a.start - b.start)
}

function matchCase(original: string, replacement: string): string {
  if (!original || !replacement) return replacement
  const first = original.charAt(0)
  if (first >= 'A' && first <= 'Z') return replacement.charAt(0).toUpperCase() + replacement.slice(1)
  return replacement
}

// 生成替换前后的对照片段，供预览；afterText 为确认后写入的内容
export function planReplacement(content: string, fromTexts: string[], to: string, languageId: string): ReplacementPlan {
  const matches = findVariantMatches(content, fromTexts, languageId)
  const before: TextPart[] = []
  const after: TextPart[] = []
  let cursor = 0
  for (const match of matches) {
    if (match.start > cursor) {
      const plain = content.slice(cursor, match.start)
      before.push({ text: plain, hit: false })
      after.push({ text: plain, hit: false })
    }
    before.push({ text: content.slice(match.start, match.end), hit: true })
    after.push({ text: matchCase(content.slice(match.start, match.end), to), hit: true })
    cursor = match.end
  }
  const rest = content.slice(cursor)
  if (rest) {
    before.push({ text: rest, hit: false })
    after.push({ text: rest, hit: false })
  }
  return {
    before,
    after,
    afterText: after.map(part => part.text).join(''),
    count: matches.length,
    replaced: [...new Set(matches.map(match => match.text))]
  }
}

// 逐段检查当前展项：漏译、旧译、一段混用多种译法
export function buildTermIssues(exhibit: Exhibit, terms: Term[]): TermIssue[] {
  const issues: TermIssue[] = []
  const zhDraft = exhibit.drafts.find(draft => draft.languageId === 'zh')
  for (const languageId of ['en', 'ja']) {
    const draft = exhibit.drafts.find(item => item.languageId === languageId)
    if (!draft) continue
    for (const term of terms.filter(item => item.languageId === languageId)) {
      const standard = term.variants.find(variant => variant.kind === 'standard')
      if (!standard) continue
      const formerTexts = term.variants.filter(variant => variant.kind === 'former').map(variant => variant.text)
      const allTexts = term.variants.map(variant => variant.text)

      // 漏译：中文段落提到该词，但目标语言所有分段都未使用任一登记译法
      if (zhDraft) {
        const zhHits = zhDraft.segments.filter(segment => segment.content.includes(term.zh))
        const used = draft.segments.some(segment => findVariantMatches(segment.content, allTexts, languageId).length > 0)
        if (!used) {
          for (const segment of zhHits) {
            issues.push({
              id: `missing-${term.id}-${segment.id}`,
              kind: 'missing',
              termId: term.id,
              zh: term.zh,
              languageId,
              standard: standard.text,
              matched: [],
              segmentId: segment.id,
              segmentLabel: segment.label,
              segmentIndex: zhDraft.segments.indexOf(segment),
              locked: segment.locked,
              content: segment.content
            })
          }
        }
      }

      // 旧译 / 混用：逐段检查目标语言稿件
      draft.segments.forEach((segment, index) => {
        const matches = findVariantMatches(segment.content, allTexts, languageId)
        if (!matches.length) return
        const usedTexts = [...new Set(matches.map(match => match.text))]
        const usedFormers = usedTexts.filter(text => formerTexts.includes(text))
        const kind = usedTexts.length >= 2 ? 'mixed' : usedFormers.length ? 'former' : null
        if (!kind) return
        issues.push({
          id: `${kind}-${term.id}-${segment.id}`,
          kind,
          termId: term.id,
          zh: term.zh,
          languageId,
          standard: standard.text,
          matched: kind === 'mixed' ? usedTexts : usedFormers,
          segmentId: segment.id,
          segmentLabel: segment.label,
          segmentIndex: index,
          locked: segment.locked,
          content: segment.content
        })
      })
    }
  }
  return issues
}
