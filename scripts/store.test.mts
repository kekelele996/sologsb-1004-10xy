// store 集成测试：术语审校全流程（经 esbuild 转译后用 node 运行）
import { createPinia, setActivePinia } from 'pinia'
import { useScriptStore } from '../stores/script.ts'

// localStorage 垫片
const memory = new Map()
globalThis.localStorage = {
  getItem: (k) => (memory.has(k) ? memory.get(k) : null),
  setItem: (k, v) => memory.set(k, String(v)),
  removeItem: (k) => memory.delete(k),
  clear: () => memory.clear()
}

let pass = 0, fail = 0
function assert(name, cond, extra) {
  if (cond) { pass++; console.log('PASS', name) }
  else { fail++; console.log('FAIL', name, extra ?? '') }
}

setActivePinia(createPinia())
const store = useScriptStore()
store.hydrate()
assert('hydrate demo + seed terms', store.terms.length === 3, store.terms.length)
store.selectExhibit('exhibit-jade')
store.selectLanguage('en')
store.autoRunReviewCheck()

let check = store.currentReviewCheck
assert('auto check exists for en draft', Boolean(check))
let issues = check.issues
const seg2 = issues.filter(i => i.segmentId === 'jade-en-2')
assert('seg2 legacy issue', seg2.some(i => i.kind === 'legacy' && i.matched.toLowerCase() === 'jade tube'), JSON.stringify(seg2))
assert('seg2 mixed issue', seg2.some(i => i.kind === 'mixed'))
assert('auto check does not log', store.reviewLogs.length === 0, store.reviewLogs.length)

// 锁定段落：只提示不写入
store.toggleLock('jade-en-2')
store.runReviewCheck()
check = store.currentReviewCheck
const lockedLegacy = check.issues.find(i => i.segmentId === 'jade-en-2' && i.kind === 'legacy')
assert('locked issue marked locked', lockedLegacy?.locked === true)
assert('mixed suppressed on locked', !check.issues.some(i => i.segmentId === 'jade-en-2' && i.kind === 'mixed'))
const before = store.selectedDraft.segments.find(s => s.id === 'jade-en-2').content
store.applyReviewFixes([lockedLegacy.id])
const after = store.selectedDraft.segments.find(s => s.id === 'jade-en-2').content
assert('locked segment not modified', before === after)

// 解锁后替换
store.toggleLock('jade-en-2')
store.runReviewCheck()
check = store.currentReviewCheck
const legacyIds = check.issues.filter(i => i.kind === 'legacy' && !i.locked).map(i => i.id)
store.applyReviewFixes(legacyIds)
const seg2Content = store.selectedDraft.segments.find(s => s.id === 'jade-en-2').content
assert('legacy replaced in body', !seg2Content.includes('jade tube') && seg2Content.includes('jade cong'), seg2Content)
assert('replacement logged', store.reviewLogs.some(l => l.action === '应用替换' && l.termZh === '玉琮' && l.location))
check = store.currentReviewCheck
assert('post-fix recheck clean for seg2', !check.issues.some(i => i.segmentId === 'jade-en-2'), JSON.stringify(check.issues))

// 术语调整：旧标准译法保留为旧译
const beforeTerm = JSON.stringify(store.terms.find(t => t.zh === '玉琮'))
store.saveTerm({ id: store.terms.find(t => t.zh === '玉琮').id, zh: '玉琮', en: 'jade ceremonial tube', ja: '玉琮', legacyEn: 'jade tube', legacyJa: '' })
const term = store.terms.find(t => t.zh === '玉琮')
assert('standard updated', term.en === 'jade ceremonial tube')
assert('old standard kept as legacy', term.legacyEn.includes('jade cong'), JSON.stringify(term.legacyEn))
assert('term adjust logged', store.reviewLogs.some(l => l.action === '调整术语'))
// 还原术语，方便后续
store.saveTerm({ id: term.id, zh: '玉琮', en: 'jade cong', ja: '玉琮', legacyEn: 'jade tube', legacyJa: '' })

// 保存版本（冻结当前干净的检查结果）
store.runReviewCheck()
store.createVersion('术语修正版')
const version = store.versions[0]
assert('version froze review result', Array.isArray(version.reviewIssues) && version.reviewCheckedAt)
const frozenCount = version.reviewIssues.length

// 再制造旧译
store.runReviewCheck()
let cleanCheck = store.currentReviewCheck
store.updateSegment('jade-en-2', { content: 'A jade tube appears again here.' })
store.autoRunReviewCheck()
assert('recheck sees reintroduced legacy', store.currentReviewCheck.issues.some(i => i.segmentId === 'jade-en-2' && i.kind === 'legacy'))

// 恢复旧版本：正文与检查结果一起回到当时
store.restoreVersion(version.id)
const restored = store.selectedDraft.segments.find(s => s.id === 'jade-en-2').content
assert('draft restored', !restored.includes('jade tube'), restored)
assert('review result restored to frozen snapshot', store.currentReviewCheck.issues.length === frozenCount, `${store.currentReviewCheck.issues.length} vs ${frozenCount}`)
store.autoRunReviewCheck()
assert('auto check frozen after restore', store.currentReviewCheck.issues.length === frozenCount)
assert('restore logged', store.reviewLogs.some(l => l.action === '恢复版本'))

// 手动重新检查解除冻结
store.runReviewCheck()
assert('manual rerun unfreezes', store.currentReviewCheck.id !== `check-frozen-${version.id}`)

// 放弃检查：正文不变
const contentNow = store.selectedDraft.segments.find(s => s.id === 'jade-en-2').content
store.dismissReviewCheck()
assert('dismiss keeps body', store.selectedDraft.segments.find(s => s.id === 'jade-en-2').content === contentNow)
assert('dismiss logged', store.reviewLogs.some(l => l.action === '放弃检查'))

// 持久化：重开浏览器
setActivePinia(createPinia())
const reopened = useScriptStore()
reopened.hydrate()
assert('terms survive reload', reopened.terms.some(t => t.zh === '玉琮'))
assert('logs survive reload', reopened.reviewLogs.some(l => l.action === '应用替换'))
reopened.selectExhibit('exhibit-jade')
reopened.selectLanguage('en')
assert('versions survive reload', reopened.versions.length === 1)
// 漏译人工提示：构造中文残留
reopened.runReviewCheck()
assert('review checks persist / rerun after reload', reopened.reviewChecks.some(c => c.exhibitId === 'exhibit-jade' && c.languageId === 'en'))
const s3 = reopened.selectedDraft.segments.find(s => s.id === 'jade-en-3')
reopened.updateSegment('jade-en-3', { content: '玉琮 links heaven and earth.' })
reopened.runReviewCheck()
const missing = reopened.currentReviewCheck.issues.find(i => i.segmentId === 'jade-en-3' && i.kind === 'missing')
assert('missing issue for untranslated zh', Boolean(missing) && missing.replacement === 'jade cong')
const s3Before = reopened.selectedDraft.segments.find(s => s.id === 'jade-en-3').content
reopened.applyReviewFixes([missing.id])
assert('missing never auto-written', reopened.selectedDraft.segments.find(s => s.id === 'jade-en-3').content === s3Before)

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
