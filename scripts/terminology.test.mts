// 术语引擎逻辑冒烟测试（node --experimental-strip-types 运行）
import { runCheck, findRanges, applyReplacements, buildParts } from '../utils/terminology.ts'

const term = {
  id: 't1', zh: '玉琮', en: 'jade cong', ja: '玉琮',
  legacyEn: ['jade tube'], legacyJa: ['玉製の琮'],
  createdAt: '', updatedAt: ''
}
const termLz = {
  id: 't2', zh: '良渚', en: 'Liangzhu', ja: '良渚',
  legacyEn: ['Liang-chu', 'Liangzhu culture'], legacyJa: ['良渚文化'],
  createdAt: '', updatedAt: ''
}

let pass = 0, fail = 0
function assert(name, cond, extra) {
  if (cond) { pass++; console.log('PASS', name) }
  else { fail++; console.log('FAIL', name, extra ?? '') }
}

// 英文词边界
let r = findRanges('Jade cong here, jade cong.', 'jade cong', 'en')
assert('en case-insensitive two matches', r.length === 2, JSON.stringify(r))
assert('en word boundary ignores prefix', findRanges('xxxjade cong', 'jade cong', 'en').length === 0)
assert('en legacy match', findRanges('a jade tube now', 'jade tube', 'en').length === 1)

// 日文子串：标准译即汉字“玉琮”，中文词命中应判为标准译，不报漏译
const draftJa = {
  id: 'd', languageId: 'ja', title: '玉琮：礼器', narration: '良渚文化の玉琮です。', accessibility: '',
  durationMinutes: 1, sources: '', status: 'draft', updatedAt: '',
  segments: [{ id: 's1', label: '段落1', content: '玉琮を紹介します。', locked: false }]
}
let issues = runCheck(draftJa, [term, termLz])
assert('ja no false missing when standard equals kanji', !issues.some(i => i.kind === 'missing'), JSON.stringify(issues))

// 英文：旧译 + 混用同段
const draftEn = {
  id: 'd', languageId: 'en', title: 'Jade Cong', narration: 'A jade tube and jade cong appear.', accessibility: '',
  durationMinutes: 1, sources: '', status: 'draft', updatedAt: '',
  segments: [
    { id: 's1', label: 'Visual description', content: 'A jade tube encloses an opening, while jade cong motifs cover corners.', locked: false },
    { id: 's2', label: 'Locked meaning', content: 'A jade tube ritual.', locked: true },
    { id: 's3', label: 'Missing here', content: 'This 玉琮 is untranslated.', locked: false }
  ]
}
issues = runCheck(draftEn, [term])
const s1 = issues.filter(i => i.segmentId === 's1')
assert('s1 legacy found', s1.some(i => i.kind === 'legacy'), JSON.stringify(s1))
assert('s1 mixed found', s1.some(i => i.kind === 'mixed'), JSON.stringify(s1))
const s2 = issues.filter(i => i.segmentId === 's2')
assert('locked segment issues flagged locked', s2.every(i => i.locked) && s2.length > 0, JSON.stringify(s2))
assert('mixed not raised on locked segment', !s2.some(i => i.kind === 'mixed'))
const s3 = issues.filter(i => i.segmentId === 's3')
assert('missing detected', s3.some(i => i.kind === 'missing' && i.matched === '玉琮'), JSON.stringify(s3))
assert('missing keeps standard as replacement hint', s3.find(i => i.kind === 'missing')?.replacement === 'jade cong')

// 漏译不应出现在可替换集合（无旧译命中时）
assert('missing has kind missing', s3.every(i => i.kind !== 'legacy'))

// 替换：保留句首大写，区间倒序不串位
const legacyIssues = s1.filter(i => i.kind === 'legacy')
const replaced = applyReplacements(draftEn.segments[0].content, legacyIssues)
assert('replacement applied', replaced === 'A jade cong encloses an opening, while jade cong motifs cover corners.', replaced)
assert('replacement removes legacy', !replaced.includes('jade tube'), replaced)

// 多区间高亮
const parts = buildParts('a jade tube and jade cong', [{ start: 2, end: 11 }])
assert('parts split marked', parts.some(p => p.marked && p.text === 'jade tube'), JSON.stringify(parts))

// 标题级字段也能检查
const titleIssues = runCheck({ ...draftEn, narration: '', accessibility: '', segments: [] }, [term])
assert('title standard no issue', titleIssues.length === 0, JSON.stringify(titleIssues))
const titleBad = runCheck({ ...draftEn, title: 'The Jade Tube', segments: [] }, [term])
assert('title legacy found', titleBad.some(i => i.field === 'title' && i.kind === 'legacy'), JSON.stringify(titleBad))

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
