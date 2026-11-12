import type { Batch } from '../types'
import { WEB_TEXTS } from './i18n'
import type { Language } from './i18n'
import type { Change, PaneState } from './journal'

/** The page's name on the hub: its address there is `/p/questions/<session>`. */
export const WEB_MOD = 'questions'

/** What the page draws from. */
export type WebState = { batches: Batch[] }

export const webState = (state: PaneState): WebState => ({ batches: state.batches })

/** What a press on the page comes to: the changes to apply in order, then whether to send the answers (and of which batch). */
export type WebOutcome = { changes: Change[]; send: null | { only?: string } }

const draftsOf = (value: unknown): Array<[string, string]> =>
  value !== null && typeof value === 'object' ? Object.entries(value as Record<string, unknown>).filter((one): one is [string, string] => typeof one[1] === 'string') : []

/** Reads one action of the page against the pane as it stands; an action naming nothing the pane holds comes to nothing. */
export const outcomeOf = (action: unknown, batches: readonly Batch[]): WebOutcome => {
  const data = (action !== null && typeof action === 'object' ? action : {}) as Record<string, unknown>
  const questions = batches.flatMap(batch => batch.questions)
  const hasBatch = (id: unknown): id is string => typeof id === 'string' && batches.some(batch => batch.id === id)
  const question = (id: unknown) => (typeof id === 'string' ? questions.find(one => one.id === id) : undefined)
  const drafts = (entries: Array<[string, string]>): Change[] =>
    entries
      .filter(([id, text]) => {
        const found = question(id)

        return found !== undefined && found.status === 'open' && found.draft !== text
      })
      .map(([id, text]) => ({ op: 'draft', id, text }))

  switch (data.type) {
    case 'draft':
      return { changes: drafts(draftsOf({ [String(data.id)]: data.text })), send: null }
    case 'send':
      return data.only === undefined || hasBatch(data.only)
        ? { changes: drafts(draftsOf(data.drafts)), send: data.only === undefined ? {} : { only: data.only } }
        : { changes: [], send: null }
    case 'hide':
      return { changes: hasBatch(data.batchId) ? [{ op: 'hide', batchId: data.batchId }] : [], send: null }
    case 'clear':
      return { changes: [{ op: 'clear' }], send: null }
    case 'resolve':
      return { changes: question(data.id)?.status === 'open' ? [{ op: 'resolve', id: String(data.id) }] : [], send: null }
    case 'reopen':
      return { changes: question(data.id)?.status === 'resolved' ? [{ op: 'reopen', id: String(data.id) }] : [], send: null }
    default:
      return { changes: [], send: null }
  }
}

const ICON = {
  logo: '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><circle cx="10" cy="10" r="7.6"></circle><path d="M7.8 7.7a2.3 2.3 0 0 1 4.4.9c0 1.6-2.2 1.8-2.2 3.1"></path><circle cx="10" cy="14.3" r=".5" fill="currentColor"></circle></svg>',
  search: '<svg class="search-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><circle cx="7" cy="7" r="4.6"></circle><path d="M10.5 10.5L14 14"></path></svg>',
}

const SCRIPT = `
  const NL = String.fromCharCode(10)
  const SVG = {
    list: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><path d="M2.5 4h11M2.5 8h11M2.5 12h7"></path></svg>',
    arrow: '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 8h10M8.5 4l4 4-4 4"></path></svg>',
    trash: '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5"></path></svg>',
    check: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7"></path></svg>',
    copy: '<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="5" width="8.5" height="8.5" rx="2"></rect><path d="M11 3.2V3a1.5 1.5 0 0 0-1.5-1.5H3A1.5 1.5 0 0 0 1.5 3v6.5A1.5 1.5 0 0 0 3 11h.2"></path></svg>',
    hide: '<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><path d="M2 8s2.3-4.5 6-4.5S14 8 14 8s-2.3 4.5-6 4.5S2 8 2 8z"></path><path d="M3 13L13 3"></path></svg>',
    reopen: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 8a5.5 5.5 0 1 0 1.7-4M2.5 2.5V5H5"></path></svg>',
    up: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 10l4-4 4 4"></path></svg>',
    down: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 6l4 4 4-4"></path></svg>',
    claude: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><path d="M8 2v12M2.8 5l10.4 6M2.8 11l10.4-6"></path></svg>',
    done: '<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.2 4.2L19 7"></path></svg>',
  }
  const DOTS = '<span class="dots" aria-hidden="true"><i></i><i></i><i></i></span>'

  const el = id => document.getElementById(id)
  const esc = text => String(text).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]))
  const fill = (text, values) => Object.keys(values).reduce((out, key) => out.split('{' + key + '}').join(String(values[key])), text)
  const T = () => TEXTS[hub.lang] || TEXTS[FALLBACK] || TEXTS.en

  const local = new Map()
  const expanded = new Set()
  const sending = new Map()
  let state = { batches: [] }
  let online = { hub: true, session: true }
  let filter = 'all'
  let query = ''
  let sel = 'all'
  let focusId = null
  let copied = null
  let order = []
  let toastTimer = 0

  const all = () => state.batches.flatMap(batch => batch.questions)
  const find = id => all().find(question => question.id === id)
  const batchOf = id => state.batches.find(batch => batch.questions.some(question => question.id === id))
  const draftOf = question => (local.has(question.id) ? local.get(question.id) : question.draft)
  const statusOf = question =>
    question.status === 'resolved' ? 'resolved' : question.status === 'sent' ? 'waiting' : draftOf(question).trim() !== '' ? 'answered' : 'open'
  const isAsked = question => question.status === 'open' && question.thread.length > 0 && question.thread[question.thread.length - 1].from === 'claude'
  const countOf = questions => {
    const counts = { open: 0, answered: 0, waiting: 0, resolved: 0 }
    questions.forEach(question => { counts[statusOf(question)] += 1 })
    return counts
  }
  const FILTER_STATUS = { all: null, todo: 'open', ready: 'answered', waiting: 'waiting', resolved: 'resolved' }
  const GLYPH = { open: '○', answered: '●', waiting: '…', resolved: '✓' }

  const shownIn = batch => batch.questions.filter(question => {
    const wanted = FILTER_STATUS[filter]
    if (wanted !== null && statusOf(question) !== wanted) return false
    if (query !== '' && question.text.toLowerCase().indexOf(query) < 0 && draftOf(question).toLowerCase().indexOf(query) < 0) return false
    return true
  })

  const vt = (prefix, id) => ' style="view-transition-name:' + prefix + '-' + String(id).split('.').join('-') + '"'

  const removable = () => state.batches.filter(batch => batch.questions.every(question => question.status === 'resolved')).length

  const navHtml = () => {
    const t = T()
    const questions = all()
    const resolvedBatches = removable()
    let html = '<div class="nav-group"><span class="eyebrow">' + esc(t.batches) + '</span>' +
      '<button class="nav-item nav-all" data-key="nav-all" data-act="sel" data-batch="all" aria-current="' + (sel === 'all') + '">' + SVG.list +
      '<span class="grow strong">' + esc(t.allQuestions) + '</span><span class="mono dim">' + questions.length + '</span></button>'
    for (const batch of state.batches) {
      const counts = countOf(batch.questions)
      const current = sel === batch.id
      const segs = [['resolved', 'var(--ok)'], ['waiting', 'var(--warn-dot)'], ['answered', 'var(--sugg)'], ['open', 'var(--track)']]
        .map(([key, color]) => '<span style="flex-grow:' + counts[key] + ';background:' + color + '"></span>').join('')
      const parts = []
      if (counts.open > 0) parts.push('<span><b class="mono dim">○</b>' + counts.open + ' ' + esc(t.toAnswer) + '</span>')
      if (counts.waiting > 0) parts.push('<span><b class="mono warn">…</b>' + counts.waiting + ' ' + esc(t.withClaude) + '</span>')
      parts.push('<span><b class="mono ok">✓</b>' + counts.resolved + '/' + batch.questions.length + ' ' + esc(t.resolvedOf) + '</span>')
      const ready = counts.answered
      html += '<div class="nav-card fadein' + (current ? ' current' : '') + '" data-key="nav-' + esc(batch.id) + '">' +
        '<button class="nav-item" data-act="sel" data-batch="' + esc(batch.id) + '" aria-current="' + current + '">' +
        '<span class="nav-title"><span class="mono dim small">#' + esc(batch.id) + '</span><span class="ellipsis strong">' + esc(batch.title) + '</span></span>' +
        '<span class="segs" aria-hidden="true">' + segs + '</span><span class="counts">' + parts.join('') + '</span></button>' +
        '<div class="nav-foot"><span class="small ' + (ready > 0 ? 'sugg' : 'faint') + '">' + esc(ready > 0 ? fill(t.readyN, { n: ready }) : t.nothingReady) + '</span>' +
        '<button class="btn-primary sm" data-act="send" data-batch="' + esc(batch.id) + '"' + (ready > 0 ? '' : ' disabled') + ' aria-label="' + esc(t.send + ' #' + batch.id) + '">' +
        SVG.arrow + esc(t.send) + (ready > 0 ? '<span class="badge">' + ready + '</span>' : '') + '</button></div></div>'
    }
    html += '<button class="ghost clear" data-key="clear" data-act="clear"' + (resolvedBatches > 0 ? '' : ' disabled') + '>' + SVG.trash + esc(t.clear) + ' · ' + resolvedBatches + '</button></div>'
    const keys = [[t.kNav, ['J', 'K']], [t.kPick, ['1–9']], [t.kEdit, ['↵']], [t.kLeave, ['Esc']], [t.kSearch, ['/']], [t.kSend, ['Ctrl', '↵']]]
    html += '<div class="keys" data-key="keys"><span class="eyebrow">' + esc(t.keys) + '</span>' + keys.map(([label, list]) =>
      '<div class="key-row"><span>' + esc(label) + '</span><span class="kbds">' + list.map(key => '<kbd>' + key + '</kbd>').join('') + '</span></div>').join('') + '</div>'
    return html
  }

  const filtersHtml = () => {
    const t = T()
    const counts = countOf(all())
    const defs = [['all', t.fAll, '', '', all().length], ['todo', t.fTodo, '○', 'dim', counts.open], ['ready', t.fReady, '●', 'sugg', counts.answered],
      ['waiting', t.fWaiting, '…', 'warn', counts.waiting], ['resolved', t.fResolved, '✓', 'ok', counts.resolved]]
    return defs.map(([key, label, glyph, tone, n]) =>
      '<button class="filter" role="tab" data-act="filter" data-key="' + key + '" aria-selected="' + (filter === key) + '">' +
      (glyph !== '' ? '<span class="mono ' + tone + '">' + glyph + '</span>' : '') + esc(label) + '<span class="mono faint small">' + n + '</span></button>').join('')
  }

  const topHtml = question => {
    const t = T()
    const status = statusOf(question)
    const asked = isAsked(question) && status === 'open'
    const label = asked ? t.stAsked : { open: t.stOpen, answered: t.stAnswered, waiting: t.stWaiting, resolved: t.stResolved }[status]
    let html = '<span class="chip mono">' + esc(question.id) + '</span><span class="pill">' +
      (status === 'waiting' ? DOTS : '<span class="mono" aria-hidden="true">' + (asked ? '↩' : GLYPH[status]) + '</span>') + esc(label) + '</span><span class="grow"></span>'
    if (question.status === 'open') {
      html += '<button class="ghost sm" data-act="resolve" data-id="' + esc(question.id) + '" title="' + esc(t.resolveHint) + '">' + SVG.check + esc(t.resolve) + '</button>'
    }
    if (question.status === 'resolved') {
      html += '<button class="ghost sm" data-act="reopen" data-id="' + esc(question.id) + '">' + SVG.reopen + esc(t.reopen) + '</button>' +
        '<button class="ghost icon" data-act="toggle" data-id="' + esc(question.id) + '" aria-label="' + esc(t.collapse) + '">' + SVG.up + '</button>'
    }
    return html
  }

  const optionsHtml = question => {
    if (question.status !== 'open' || question.options.length === 0) return ''
    const draft = draftOf(question).trim()
    return '<div class="options" role="group" aria-label="' + esc(T().variants) + '">' + question.options.map((option, index) => {
      const on = draft === option
      return '<button class="opt" data-key="opt-' + index + '" data-act="pick" data-id="' + esc(question.id) + '" data-index="' + index + '" aria-pressed="' + on + '">' +
        '<span class="opt-key mono">' + (on ? SVG.check : index + 1) + '</span><span class="opt-label">' + esc(option) + '</span></button>'
    }).join('') + '</div>'
  }

  const previewHtml = question => {
    const t = T()
    const draft = draftOf(question).trim()
    return '<span class="' + (draft !== '' ? 'sugg' : 'faint') + ' ellipsis">' + esc(draft !== '' ? t.willSend + draft : t.draftHint) + '</span>' +
      '<span class="kbds small faint"><kbd>Ctrl</kbd><kbd>↵</kbd>' + esc(t.sendBatchShort) + '</span>'
  }

  const cardClass = question => {
    const status = statusOf(question)
    return 'card fadein st-' + status + (isAsked(question) && status === 'open' ? ' asked' : '') + (focusId === question.id ? ' focused' : '')
  }

  const cardHtml = question => {
    const t = T()
    const id = esc(question.id)
    if (question.status === 'resolved' && !expanded.has(question.id)) {
      const yours = question.thread.filter(entry => entry.from === 'user').pop()
      return '<button class="row fadein' + (focusId === question.id ? ' focused' : '') + '" id="card-' + id + '"' + vt('q', question.id) + ' data-act="toggle" data-id="' + id + '" aria-label="' + esc(t.expand + ' ' + question.id) + '">' +
        '<span class="row-check">' + SVG.check + '</span><span class="mono faint small">' + id + '</span>' +
        '<span class="row-text ellipsis">' + esc(question.text) + '</span>' +
        (yours ? '<span class="row-answer ellipsis">' + esc(yours.text) + '</span>' : '') + SVG.down + '</button>'
    }
    const thread = question.thread.map(entry => {
      const isClaude = entry.from === 'claude'
      return '<li class="msg ' + (isClaude ? 'from-claude' : 'from-you') + '"><span class="avatar" aria-hidden="true">' + (isClaude ? SVG.claude : esc(t.you.charAt(0))) + '</span>' +
        '<div class="msg-body"><span class="msg-name">' + (isClaude ? 'Claude' : esc(t.you)) + '</span><div class="bubble">' + esc(entry.text) + '</div></div></li>'
    }).join('') + (question.status === 'sent'
      ? '<li class="msg from-claude typing"><span class="avatar" aria-hidden="true">' + SVG.claude + '</span><span class="bubble muted">' + DOTS + esc(t.typing) + '</span></li>' : '')
    return '<article class="' + cardClass(question) + '" id="card-' + id + '"' + vt('q', question.id) + ' data-id="' + id + '" tabindex="0" aria-label="' + esc(question.id) + '">' +
      '<div class="card-top" id="top-' + id + '">' + topHtml(question) + '</div>' +
      '<p class="q-text">' + esc(question.text) + '</p>' +
      (thread !== '' ? '<ol class="thread">' + thread + '</ol>' : '') +
      '<div id="opts-' + id + '">' + optionsHtml(question) + '</div>' +
      (question.status === 'open'
        ? '<div class="answer"><textarea class="field" id="ans-' + id + '" data-id="' + id + '" rows="2" placeholder="' + esc(question.options.length > 0 ? t.ownAnswer : t.answer) + '" aria-label="' + esc(t.answerTo + ' ' + question.id) + '">' + esc(draftOf(question)) + '</textarea>' +
          '<div class="answer-foot" id="prev-' + id + '">' + previewHtml(question) + '</div></div>'
        : '') +
      '</article>'
  }

  const listHtml = () => {
    const t = T()
    order = []
    const sections = state.batches.filter(batch => sel === 'all' || sel === batch.id).map(batch => {
      const shown = shownIn(batch)
      if (shown.length === 0) return ''
      shown.forEach(question => order.push(question.id))
      const counts = countOf(batch.questions)
      const id = esc(batch.id)
      return '<section class="batch fadein" id="batch-' + id + '" aria-label="' + esc(batch.title) + '"><div class="batch-head"' + vt('b', batch.id) + '><div class="batch-name">' +
        '<h2>' + esc(batch.title) + '</h2><span class="meta"><span class="mono">#' + id + '</span> · ' + esc(fill(t.batchMeta, { total: batch.questions.length, resolved: counts.resolved })) + '</span></div>' +
        '<div class="batch-actions">' +
        '<button class="ghost" data-act="copy" data-batch="' + id + '">' + (copied === batch.id ? '<span class="ok">' + SVG.check + esc(t.copied) + '</span>' : SVG.copy + esc(t.copy)) + '</button>' +
        '<button class="ghost" data-act="hide" data-batch="' + id + '">' + SVG.hide + esc(t.hide) + '</button>' +
        '<button class="btn-primary" data-act="send" data-batch="' + id + '"' + (counts.answered > 0 ? '' : ' disabled') + '>' + SVG.arrow + esc(t.send) + (counts.answered > 0 ? ' ' + counts.answered : '') + '</button>' +
        '</div></div><div class="cards">' + shown.map(cardHtml).join('') + '</div></section>'
    }).join('')
    if (sections !== '') return sections
    const nothing = all().length === 0
    return '<div class="empty fadein" data-key="empty"><div class="empty-icon">' + SVG.done + '</div><h2>' + esc(nothing ? t.emptyTitle : t.noMatchTitle) + '</h2><p>' + esc(nothing ? t.emptyHint : t.noMatchHint) + '</p></div>'
  }

  const outboxHtml = () => {
    const t = T()
    const groups = state.batches.map(batch => ({ batch, items: batch.questions.filter(question => statusOf(question) === 'answered') })).filter(group => group.items.length > 0)
    const ready = groups.reduce((sum, group) => sum + group.items.length, 0)
    let html = '<div class="out-head"><h3 class="eyebrow">' + esc(t.outbox) + '</h3><span class="count mono">' + ready + '</span></div>'
    if (groups.length === 0) return html + '<p class="out-empty">' + esc(t.outboxEmpty) + '</p>'
    html += groups.map(({ batch, items }) =>
      '<section class="out-group fadein" data-key="out-' + esc(batch.id) + '" aria-label="' + esc(batch.title) + '"><div class="out-group-head"><span class="mono dim small">#' + esc(batch.id) + '</span>' +
      '<span class="grow ellipsis strong small">' + esc(batch.title) + '</span>' +
      '<button class="btn-primary sm" data-act="send" data-batch="' + esc(batch.id) + '" aria-label="' + esc(t.send + ' #' + batch.id) + '">' + SVG.arrow + esc(t.send) + '<span class="badge">' + items.length + '</span></button></div>' +
      '<ul>' + items.map(question => '<li class="fadein" data-key="out-' + esc(question.id) + '"><span class="ellipsis dim"><span class="mono faint">[' + esc(question.id) + ']</span> ' + esc(question.text) + '</span><span class="out-answer">→ ' + esc(draftOf(question).trim()) + '</span></li>').join('') + '</ul></section>').join('')
    if (groups.length > 1) html += '<button class="btn-primary wide" data-act="sendAll">' + SVG.arrow + esc(t.sendAll) + ' · ' + ready + '</button>'
    return html
  }

  const connHtml = () => {
    const t = T()
    const tone = !online.hub ? 'down' : online.session ? 'on' : 'off'
    return '<i class="' + tone + '"></i>' + esc(!online.hub ? t.hubDown : online.session ? t.online : t.offline)
  }

  const statics = () => {
    const t = T()
    document.documentElement.lang = hub.lang in TEXTS ? hub.lang : FALLBACK
    document.title = t.title + ' · Claude'
    el('title').textContent = t.title
    el('subtitle').textContent = t.subtitle
    el('search').placeholder = t.search
    el('search').setAttribute('aria-label', t.search)
    el('filters').setAttribute('aria-label', t.filter)
    el('nav').setAttribute('aria-label', t.batches)
    el('outbox').setAttribute('aria-label', t.outbox)
  }

  const keyOf = node => (node.nodeType === 1 ? node.id || node.getAttribute('data-key') || null : null)

  const morph = (from, to) => {
    for (const { name } of [...from.attributes]) if (!to.hasAttribute(name)) from.removeAttribute(name)
    for (const { name, value } of [...to.attributes]) if (from.getAttribute(name) !== value) from.setAttribute(name, value)
    if (from.tagName === 'TEXTAREA') {
      if (document.activeElement !== from && from.value !== to.value) from.value = to.value
      return
    }
    morphChildren(from, to)
  }

  const morphChildren = (from, to) => {
    const keyed = new Map()
    for (const child of from.childNodes) { const key = keyOf(child); if (key !== null) keyed.set(key, child) }
    let cursor = from.firstChild
    for (const next of [...to.childNodes]) {
      const key = keyOf(next)
      let match = key !== null ? keyed.get(key) || null
        : cursor !== null && keyOf(cursor) === null && cursor.nodeType === next.nodeType ? cursor : null
      if (match !== null && match.nodeType === 1 && match.tagName !== next.tagName) match = null
      if (match === null) { from.insertBefore(next, cursor); continue }
      if (key !== null) keyed.delete(key)
      if (match === cursor) cursor = cursor.nextSibling; else from.insertBefore(match, cursor)
      if (match.nodeType === 1) morph(match, next)
      else if (match.nodeValue !== next.nodeValue) match.nodeValue = next.nodeValue
    }
    while (cursor !== null) { const after = cursor.nextSibling; from.removeChild(cursor); cursor = after }
  }

  const patch = (node, html) => {
    if (node === null) return
    const fresh = document.createElement(node.tagName)
    fresh.innerHTML = html
    morphChildren(node, fresh)
  }

  const calm = matchMedia('(prefers-reduced-motion: reduce)')
  const smoothly = change => {
    const typing = document.activeElement !== null && (document.activeElement.tagName === 'TEXTAREA' || document.activeElement.tagName === 'INPUT')
    if (typeof document.startViewTransition !== 'function' || calm.matches || typing || document.hidden || !drawn) { change(); return }
    let isDone = false
    const once = () => { if (!isDone) { isDone = true; change() } }
    try { document.startViewTransition(once) } catch { once() }
    setTimeout(once, 250)
  }

  const side = () => {
    patch(el('nav'), navHtml())
    patch(el('filters'), filtersHtml())
    patch(el('outbox'), outboxHtml())
    patch(el('conn'), connHtml())
  }

  let drawn = false
  const draw = () => {
    const active = document.activeElement
    const kept = active !== null && active.id !== '' && active.id !== 'search'
      ? { id: active.id, start: active.selectionStart, end: active.selectionEnd } : null
    statics()
    side()
    patch(el('list'), listHtml())
    if (kept !== null) {
      const again = el(kept.id)
      if (again !== null) {
        again.focus({ preventScroll: true })
        if (typeof kept.start === 'number' && again.setSelectionRange) again.setSelectionRange(kept.start, kept.end)
      }
    }
  }

  const refresh = id => {
    const question = find(id)
    if (question === undefined) return
    const card = el('card-' + id)
    if (card !== null && card.tagName === 'ARTICLE') {
      card.className = cardClass(question)
      patch(el('top-' + id), topHtml(question))
      patch(el('opts-' + id), optionsHtml(question))
      patch(el('prev-' + id), previewHtml(question))
    }
    side()
  }

  const toast = text => {
    el('toast').innerHTML = '<div class="toast" role="status">' + esc(text) + '</div>'
    clearTimeout(toastTimer)
    toastTimer = setTimeout(() => { el('toast').innerHTML = '' }, 3200)
  }

  const act = async action => {
    try { return await hub.send(action) } catch { toast(T().failed); return null }
  }

  const send = async only => {
    const ready = all().filter(question => statusOf(question) === 'answered' && (only === undefined || batchOf(question.id).id === only))
    if (ready.length === 0) { toast(T().nothingToSend); return }
    const sent = await act({ type: 'send', only, drafts: Object.fromEntries(local) })
    if (sent === null) return
    sending.set(sent.id, ready.length)
    if (!sent.online) toast(T().queued)
  }

  const setFocus = id => {
    if (focusId === id) return
    const before = focusId === null ? null : el('card-' + focusId)
    if (before !== null) before.classList.remove('focused')
    focusId = id
    const now = id === null ? null : el('card-' + id)
    if (now !== null) now.classList.add('focused')
  }

  const focusCard = (id, toField) => {
    setFocus(id)
    const target = el((toField ? 'ans-' : 'card-') + id)
    if (target !== null) {
      target.focus({ preventScroll: true })
      target.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  }

  const pick = (id, index) => {
    const question = find(id)
    if (question === undefined || question.status !== 'open') return
    const option = question.options[index]
    if (option === undefined) return
    const text = draftOf(question).trim() === option ? '' : option
    local.set(id, text)
    setFocus(id)
    const field = el('ans-' + id)
    if (field !== null) field.value = text
    refresh(id)
    void act({ type: 'draft', id, text })
  }

  const copyBatch = batchId => {
    const t = T()
    const batch = state.batches.find(one => one.id === batchId)
    if (batch === undefined) return
    const text = ['«' + batch.title + '»'].concat(batch.questions.map(question => {
      const lines = ['[' + question.id + '] ' + question.text]
      question.thread.forEach(entry => lines.push((entry.from === 'claude' ? 'Claude' : t.you) + ': ' + entry.text))
      if (question.status === 'open' && question.options.length > 0) lines.push('(' + question.options.join(' / ') + ')')
      const draft = draftOf(question).trim()
      if (question.status === 'open' && draft !== '') lines.push('→ ' + draft)
      return lines.join(NL)
    })).join(NL + NL)
    try { void navigator.clipboard.writeText(text) } catch {}
    copied = batchId
    draw()
    setTimeout(() => { if (copied === batchId) { copied = null; draw() } }, 1600)
  }

  document.addEventListener('click', event => {
    const button = event.target.closest('[data-act]')
    if (button === null || button.disabled) return
    const { act: name, id, batch, index, key } = button.dataset
    if (name === 'sel') { sel = batch; smoothly(draw) }
    if (name === 'filter') { filter = key; smoothly(draw) }
    if (name === 'send') void send(batch)
    if (name === 'sendAll') void send(undefined)
    if (name === 'copy') copyBatch(batch)
    if (name === 'hide') { if (sel === batch) sel = 'all'; void act({ type: 'hide', batchId: batch }).then(sent => { if (sent !== null) toast(T().hidden) }) }
    if (name === 'clear') { const n = removable(); sel = 'all'; void act({ type: 'clear' }).then(sent => { if (sent !== null) toast(fill(T().cleared, { n })) }) }
    if (name === 'pick') pick(id, Number(index))
    if (name === 'resolve') void act({ type: 'resolve', id })
    if (name === 'reopen') { expanded.add(id); void act({ type: 'reopen', id }) }
    if (name === 'toggle') {
      if (expanded.has(id)) expanded.delete(id); else expanded.add(id)
      focusId = id
      smoothly(() => { draw(); focusCard(id, false) })
    }
  })

  document.addEventListener('focusin', event => {
    const card = event.target.closest('[id^="card-"]')
    if (card !== null) setFocus(card.id.slice(5))
  })

  document.addEventListener('input', event => {
    if (event.target.id === 'search') { query = event.target.value.trim().toLowerCase(); patch(el('list'), listHtml()); return }
    if (event.target.tagName !== 'TEXTAREA') return
    local.set(event.target.dataset.id, event.target.value)
    refresh(event.target.dataset.id)
  })

  document.addEventListener('focusout', event => {
    if (event.target.tagName !== 'TEXTAREA') return
    void act({ type: 'draft', id: event.target.dataset.id, text: event.target.value })
  })

  document.addEventListener('keydown', event => {
    const target = event.target
    const typing = target.tagName === 'TEXTAREA' || target.tagName === 'INPUT'
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault()
      const batch = focusId === null ? undefined : batchOf(focusId)
      void send(batch === undefined ? undefined : batch.id)
      return
    }
    if (typing) {
      if (event.key === 'Escape') {
        event.preventDefault()
        if (target.tagName === 'TEXTAREA') focusCard(target.dataset.id, false); else target.blur()
      }
      return
    }
    if (event.altKey || event.metaKey || event.ctrlKey) return
    if (event.key === '/') { event.preventDefault(); el('search').focus(); return }
    const at = order.indexOf(focusId)
    if (event.key === 'j' || event.key === 'ArrowDown') { event.preventDefault(); if (order.length > 0) focusCard(order[Math.min(order.length - 1, at + 1)], false); return }
    if (event.key === 'k' || event.key === 'ArrowUp') { event.preventDefault(); if (order.length > 0) focusCard(order[Math.max(0, at - 1)], false); return }
    if (focusId === null || !target.matches('article.card')) return
    const question = find(focusId)
    if (question === undefined || question.status !== 'open') return
    if (event.key >= '1' && event.key <= '9') { event.preventDefault(); pick(question.id, Number(event.key) - 1); return }
    if (event.key === 'Enter') { event.preventDefault(); focusCard(question.id, true) }
  })

  const shapeOf = batches => JSON.stringify(batches.map(batch => [batch.id, batch.questions.map(question => [question.id, question.status, question.thread.length, question.options.length])]))
  let shape = ''

  hub.onState(next => {
    state = next && Array.isArray(next.batches) ? next : { batches: [] }
    const nextShape = shapeOf(state.batches)
    const isReshaped = nextShape !== shape
    shape = nextShape
    const open = new Map(all().filter(question => question.status === 'open').map(question => [question.id, question]))
    for (const [id, text] of [...local]) {
      const question = open.get(id)
      if (question === undefined || (question.draft === text && document.activeElement !== el('ans-' + id))) local.delete(id)
    }
    if (sel !== 'all' && !state.batches.some(batch => batch.id === sel)) sel = 'all'
    if (isReshaped) smoothly(draw); else draw()
    drawn = true
  })
  hub.onOnline(next => { online = next; patch(el('conn'), connHtml()) })
  hub.onDelivered(ids => {
    const delivered = ids.filter(id => sending.has(id))
    if (delivered.length === 0) return
    const n = delivered.reduce((sum, id) => sum + sending.get(id), 0)
    delivered.forEach(id => sending.delete(id))
    toast(fill(T().sent, { n }))
  })
  hub.onLang(draw)
  draw()
`

const STYLE = `
  :root {
    color-scheme: light dark;
    --bg: #F6F5F1; --surface: #FFFFFF; --surface2: #F0EEE9; --border: #E4E1DA; --border2: #D3CFC6;
    --text: #1E1D1A; --muted: #64625C; --faint: #85837C;
    --claude: #B9552F; --claude-soft: rgba(185,85,47,.08); --claude-line: rgba(185,85,47,.42);
    --sugg: #4351C7; --sugg-soft: rgba(67,81,199,.07); --sugg-line: rgba(67,81,199,.42);
    --warn: #8F5B00; --warn-soft: rgba(214,152,20,.09); --warn-dot: #D69814; --warn-line: rgba(214,152,20,.55);
    --ok: #2A7A3D; --ok-soft: rgba(42,122,61,.07); --ok-line: rgba(42,122,61,.32);
    --ring: rgba(67,81,199,.28); --track: #E7E4DD; --on-accent: #FFFFFF;
    --shadow: 0 1px 2px rgba(30,25,10,.04), 0 6px 20px rgba(30,25,10,.05);
    --toast: #1E1D1A; --toast-fg: #F4F3EF;
    --mono: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme='light']) {
      --bg: #121211; --surface: #1A1A19; --surface2: #242422; --border: #2B2B29; --border2: #3A3A37;
      --text: #EDECE8; --muted: #A6A59F; --faint: #85847E;
      --claude: #E3845F; --claude-soft: rgba(227,132,95,.10); --claude-line: rgba(227,132,95,.45);
      --sugg: #AEB6FA; --sugg-soft: rgba(174,182,250,.09); --sugg-line: rgba(174,182,250,.5);
      --warn: #F2B735; --warn-soft: rgba(242,183,53,.07); --warn-dot: #F2B735; --warn-line: rgba(242,183,53,.42);
      --ok: #66C47A; --ok-soft: rgba(102,196,122,.07); --ok-line: rgba(102,196,122,.32);
      --ring: rgba(174,182,250,.35); --track: #2B2B29; --on-accent: #17120F;
      --shadow: 0 1px 2px rgba(0,0,0,.35); --toast: #EDECE8; --toast-fg: #141413;
    }
  }
  :root[data-theme='dark'] {
    color-scheme: dark;
    --bg: #121211; --surface: #1A1A19; --surface2: #242422; --border: #2B2B29; --border2: #3A3A37;
    --text: #EDECE8; --muted: #A6A59F; --faint: #85847E;
    --claude: #E3845F; --claude-soft: rgba(227,132,95,.10); --claude-line: rgba(227,132,95,.45);
    --sugg: #AEB6FA; --sugg-soft: rgba(174,182,250,.09); --sugg-line: rgba(174,182,250,.5);
    --warn: #F2B735; --warn-soft: rgba(242,183,53,.07); --warn-dot: #F2B735; --warn-line: rgba(242,183,53,.42);
    --ok: #66C47A; --ok-soft: rgba(102,196,122,.07); --ok-line: rgba(102,196,122,.32);
    --ring: rgba(174,182,250,.35); --track: #2B2B29; --on-accent: #17120F;
    --shadow: 0 1px 2px rgba(0,0,0,.35); --toast: #EDECE8; --toast-fg: #141413;
  }
  :root[data-theme='light'] { color-scheme: light; }

  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; background: var(--bg); color: var(--text); font: 14px/1.5 Inter, system-ui, -apple-system, 'Segoe UI', sans-serif; transition: background .25s, color .25s; }
  button { font: inherit; cursor: pointer; color: inherit; }
  button:disabled { cursor: default; }
  :focus-visible { outline: 2px solid var(--sugg); outline-offset: 2px; }
  h1, h2, h3, p { margin: 0; }

  .mono { font-family: var(--mono); }
  .small { font-size: 12px; }
  .strong { font-weight: 600; }
  .grow { flex: 1 1 auto; min-width: 0; }
  .ellipsis { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
  .dim { color: var(--muted); } .faint { color: var(--faint); } .sugg { color: var(--sugg); } .warn { color: var(--warn); } .ok { color: var(--ok); }
  span.ok { display: inline-flex; align-items: center; gap: 6px; }
  .eyebrow { font-size: 11px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; color: var(--faint); }

  .top { position: sticky; top: 0; z-index: 5; background: var(--bg); border-bottom: 1px solid var(--border); }
  .top-in { max-width: 1440px; margin: 0 auto; padding: 14px 24px; display: flex; flex-wrap: wrap; align-items: center; gap: 12px 20px; }
  .brand { display: flex; align-items: center; gap: 12px; flex: 1 1 auto; min-width: 200px; }
  .logo { width: 36px; height: 36px; border-radius: 10px; background: var(--claude-soft); color: var(--claude); display: flex; align-items: center; justify-content: center; flex: none; }
  .brand-text { display: flex; flex-direction: column; min-width: 0; }
  h1 { font-size: 17px; font-weight: 650; letter-spacing: -0.015em; line-height: 1.25; }
  .sub { font-size: 12px; color: var(--muted); }
  .conn { display: inline-flex; align-items: center; gap: 7px; font-size: 12px; color: var(--muted); white-space: nowrap; }
  .conn i { width: 8px; height: 8px; border-radius: 50%; background: var(--faint); }
  .conn i.on { background: var(--ok); box-shadow: 0 0 0 3px var(--ok-soft); }
  .conn i.down { background: var(--claude); }
  .search { position: relative; flex: 0 1 320px; min-width: 180px; }
  .search-icon { position: absolute; left: 12px; top: 11px; color: var(--faint); }
  .field { width: 100%; border: 1px solid var(--border); background: var(--surface); color: var(--text); font: inherit; transition: border-color .15s, box-shadow .15s; }
  .field:focus { border-color: var(--sugg); box-shadow: 0 0 0 3px var(--ring); outline: none; }
  .field::placeholder { color: var(--faint); }
  #search { height: 38px; border-radius: 10px; padding: 0 12px 0 36px; font-size: 13.5px; }

  .layout { max-width: 1440px; margin: 0 auto; padding: 24px; display: grid; grid-template-columns: minmax(240px, 280px) minmax(0, 1fr) minmax(280px, 320px); gap: 24px; align-items: start; }
  .side { position: sticky; top: 91px; max-height: calc(100vh - 115px); overflow-y: auto; overscroll-behavior: contain; scrollbar-width: thin; scrollbar-color: var(--border2) transparent; }
  .nav-col { grid-column: 1; grid-row: 1 / span 2; min-width: 0; display: flex; flex-direction: column; gap: 18px; padding: 2px 6px 2px 2px; }
  .main-col { grid-column: 2; grid-row: 1; min-width: 0; display: flex; flex-direction: column; gap: 20px; }
  .out-col { grid-column: 3; grid-row: 1; min-width: 0; display: flex; flex-direction: column; gap: 12px; padding: 2px; }
  @media (max-width: 1180px) {
    .layout { grid-template-columns: minmax(220px, 260px) minmax(0, 1fr); }
    .out-col { grid-column: 2; grid-row: 2; position: static; max-height: none; overflow: visible; }
  }
  @media (max-width: 760px) {
    .layout { grid-template-columns: minmax(0, 1fr); gap: 20px; padding: 16px; }
    .nav-col, .main-col, .out-col { grid-column: 1; grid-row: auto; }
    .side { position: static; max-height: none; overflow: visible; }
    .nav-col .keys { display: none; }
  }

  .ghost { border: 0; background: transparent; border-radius: 9px; height: 34px; padding: 0 10px; font-size: 13px; color: var(--muted); display: inline-flex; align-items: center; gap: 6px; }
  .ghost.sm { height: 30px; padding: 0 9px; font-size: 12.5px; border-radius: 8px; }
  .ghost.icon { width: 30px; height: 30px; padding: 0; justify-content: center; }
  .ghost:hover:not(:disabled) { background: var(--surface2); color: var(--text); }
  .btn-primary { border: 0; height: 34px; border-radius: 9px; padding: 0 14px; font-size: 13px; font-weight: 600; display: inline-flex; align-items: center; gap: 7px; background: var(--claude); color: var(--on-accent); transition: filter .15s, background .2s, color .2s, transform .1s; }
  .btn-primary.sm { height: 30px; border-radius: 8px; padding: 0 11px; font-size: 12.5px; gap: 6px; flex: none; }
  .btn-primary.wide { height: 42px; border-radius: 11px; font-size: 13.5px; font-weight: 650; justify-content: center; }
  .btn-primary:hover:not(:disabled) { filter: brightness(1.07); }
  .btn-primary:active:not(:disabled) { transform: translateY(1px); }
  .btn-primary:disabled { background: var(--surface2); color: var(--faint); }
  .badge { font-family: var(--mono); font-size: 11px; background: rgba(0,0,0,.14); border-radius: 5px; padding: 0 5px; }

  .nav-group { display: flex; flex-direction: column; gap: 4px; }
  .nav-group > .eyebrow { padding: 0 10px 6px; }
  .nav-item { border: 0; background: transparent; border-radius: 10px; padding: 9px 10px; display: flex; align-items: center; gap: 10px; text-align: left; width: 100%; }
  .nav-item:hover { background: var(--surface2); }
  .nav-all { color: var(--text); }
  .nav-all svg { color: var(--muted); }
  .nav-all[aria-current='true'] { background: var(--surface2); }
  .nav-card { border: 1px solid var(--border); background: var(--surface); border-radius: 12px; display: flex; flex-direction: column; transition: background .15s, border-color .15s; }
  .nav-card.current { background: var(--surface2); border-color: var(--border2); }
  .nav-card .nav-item { border-radius: 11px 11px 0 0; padding: 11px 12px 8px; flex-direction: column; align-items: stretch; gap: 8px; }
  .nav-title { display: flex; align-items: center; gap: 8px; }
  .segs { display: flex; gap: 2px; height: 4px; }
  .segs { transform-origin: left center; animation: qpGrow .7s cubic-bezier(.2,.7,.3,1); }
  .segs span { flex-basis: 0; border-radius: 2px; transition: flex-grow .6s cubic-bezier(.2,.7,.3,1), background-color .3s; }
  @keyframes qpGrow { from { transform: scaleX(0); opacity: .4; } to { transform: none; opacity: 1; } }
  .counts { display: flex; flex-wrap: wrap; gap: 2px 10px; font-size: 12px; color: var(--muted); }
  .counts span { display: inline-flex; align-items: center; gap: 4px; }
  .counts b { font-weight: 400; }
  .nav-foot { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 0 8px 8px 12px; }
  .clear { margin-top: 6px; height: 34px; border: 1px dashed var(--border2); border-radius: 10px; justify-content: center; font-size: 12.5px; color: var(--text); }
  .clear:disabled { color: var(--faint); }
  .keys { border: 1px solid var(--border); border-radius: 12px; padding: 14px; display: flex; flex-direction: column; gap: 9px; background: var(--surface); }
  .key-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 12.5px; color: var(--muted); }
  .kbds { display: inline-flex; align-items: center; gap: 3px; flex: none; }
  kbd { font-family: var(--mono); font-size: 11px; min-width: 20px; height: 20px; padding: 0 5px; display: inline-flex; align-items: center; justify-content: center; border: 1px solid var(--border2); border-bottom-width: 2px; border-radius: 5px; color: var(--muted); background: var(--surface); }

  .filters { display: flex; flex-wrap: wrap; gap: 6px; }
  .filter { height: 32px; border: 1px solid var(--border); background: transparent; color: var(--muted); border-radius: 999px; padding: 0 12px; font-size: 13px; font-weight: 500; display: inline-flex; align-items: center; gap: 7px; transition: background .15s, color .15s, border-color .15s; }
  .filter:hover { color: var(--text); }
  .filter[aria-selected='true'] { background: var(--text); border-color: var(--text); color: var(--bg); }
  .filter[aria-selected='true'] .mono { color: inherit; opacity: .75; }

  .list { display: flex; flex-direction: column; gap: 28px; }
  .batch { display: flex; flex-direction: column; gap: 12px; }
  .batch-head { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 16px; padding: 4px 2px; }
  .batch-name { flex: 1 1 260px; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
  h2 { font-size: 19px; font-weight: 650; letter-spacing: -0.015em; line-height: 1.3; }
  .meta { font-size: 12.5px; color: var(--muted); }
  .batch-actions { display: flex; align-items: center; gap: 6px; }
  .cards { display: flex; flex-direction: column; gap: 10px; }

  .row { width: 100%; text-align: left; border: 1px solid var(--border); background: transparent; border-radius: 12px; padding: 11px 16px; display: flex; align-items: center; gap: 12px; transition: background .15s; color: var(--faint); }
  .row:hover { background: var(--surface); }
  .row.focused { box-shadow: 0 0 0 4px var(--ring); }
  .row-check { width: 22px; height: 22px; border-radius: 50%; background: var(--ok-soft); color: var(--ok); display: flex; align-items: center; justify-content: center; flex: none; }
  .row-text { flex: 1 1 auto; color: var(--muted); }
  .row-answer { flex: 0 1 auto; max-width: 40%; font-size: 13px; font-weight: 500; color: var(--text); }

  .card { border: 1px solid var(--border); background: var(--surface); border-radius: 16px; padding: 18px 20px 20px; display: flex; flex-direction: column; gap: 14px; box-shadow: var(--shadow); transition: border-color .25s, background .25s, box-shadow .2s; }
  .card:focus { outline: none; }
  .card.st-answered { border-color: var(--sugg-line); }
  .card.st-waiting { border-color: var(--warn-line); }
  .card.st-resolved { border-color: var(--ok-line); background: transparent; box-shadow: none; }
  .card.asked { border-color: var(--claude-line); }
  .card.focused { border-color: var(--sugg); box-shadow: 0 0 0 4px var(--ring); }
  .card-top { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .chip { font-size: 12px; font-weight: 600; background: var(--surface2); border-radius: 7px; padding: 2px 8px; }
  .pill { display: inline-flex; align-items: center; gap: 7px; height: 24px; border-radius: 999px; padding: 0 10px; font-size: 12.5px; font-weight: 550; color: var(--muted); background: var(--surface2); }
  .st-answered .pill { color: var(--sugg); background: var(--sugg-soft); }
  .st-waiting .pill { color: var(--warn); background: var(--warn-soft); }
  .st-resolved .pill { color: var(--ok); background: var(--ok-soft); }
  .asked .pill { color: var(--claude); background: var(--claude-soft); }
  .q-text { font-size: 16.5px; line-height: 1.45; font-weight: 600; letter-spacing: -0.01em; white-space: pre-wrap; }
  .st-resolved .q-text { color: var(--muted); }

  .thread { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
  .msg { display: flex; gap: 10px; align-items: flex-start; }
  .msg.typing { align-items: center; }
  .avatar { width: 28px; height: 28px; border-radius: 50%; flex: none; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 650; background: var(--surface2); color: var(--muted); }
  .from-claude .avatar { background: var(--claude-soft); color: var(--claude); }
  .msg-body { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
  .msg-name { font-size: 12px; font-weight: 600; }
  .from-claude .msg-name { color: var(--claude); }
  .bubble { align-self: flex-start; max-width: 100%; background: var(--surface2); border: 1px solid transparent; border-radius: 4px 12px 12px 12px; padding: 8px 12px; white-space: pre-wrap; overflow-wrap: anywhere; }
  .from-claude .bubble { background: var(--claude-soft); border-color: var(--claude-line); }
  .bubble.muted { display: inline-flex; align-items: center; gap: 10px; font-size: 13px; color: var(--muted); background: var(--surface2); border-color: transparent; }

  .options { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 8px; }
  .opt { text-align: left; min-height: 48px; border: 1.5px solid var(--border); background: transparent; border-radius: 12px; padding: 10px 12px; display: flex; align-items: flex-start; gap: 10px; transition: background .15s, border-color .15s; }
  .opt:hover { border-color: var(--border2); }
  .opt-key { width: 22px; height: 22px; border-radius: 7px; flex: none; display: flex; align-items: center; justify-content: center; font-size: 11.5px; font-weight: 600; background: var(--surface2); color: var(--muted); transition: background .15s; }
  .opt-label { font-size: 14px; font-weight: 600; padding-top: 1px; overflow-wrap: anywhere; }
  .opt[aria-pressed='true'] { border-color: var(--sugg); background: var(--sugg-soft); }
  .opt[aria-pressed='true'] .opt-key { background: var(--sugg); color: var(--surface); }
  .opt[aria-pressed='true'] .opt-label { color: var(--sugg); }

  .answer { display: flex; flex-direction: column; gap: 6px; }
  textarea.field { min-height: 60px; resize: vertical; border-radius: 12px; padding: 10px 14px; font-size: 14px; line-height: 1.5; }
  .answer-foot { display: flex; justify-content: space-between; gap: 12px; font-size: 12px; min-height: 20px; align-items: center; }
  .answer-foot .kbds { gap: 4px; }

  .empty { border: 1px dashed var(--border2); border-radius: 16px; padding: 64px 24px; display: flex; flex-direction: column; align-items: center; text-align: center; gap: 12px; }
  .empty-icon { width: 64px; height: 64px; border-radius: 20px; background: var(--ok-soft); color: var(--ok); display: flex; align-items: center; justify-content: center; }
  .empty p { color: var(--muted); max-width: 420px; }

  .out-head { display: flex; align-items: center; justify-content: space-between; padding: 0 4px; }
  .count { font-size: 12px; color: var(--sugg); background: var(--sugg-soft); border-radius: 999px; padding: 1px 8px; }
  .out-empty { border: 1px dashed var(--border2); border-radius: 14px; padding: 18px; font-size: 13px; color: var(--muted); }
  .out-group { border: 1px solid var(--border); background: var(--surface); border-radius: 14px; box-shadow: var(--shadow); display: flex; flex-direction: column; }
  .out-group-head { display: flex; align-items: center; gap: 8px; padding: 12px 12px 10px 14px; border-bottom: 1px solid var(--border); }
  .out-group ul { list-style: none; margin: 0; padding: 12px 14px 14px; display: flex; flex-direction: column; gap: 10px; }
  .out-group li { display: flex; flex-direction: column; gap: 2px; font-size: 13px; }
  .out-answer { font-weight: 550; white-space: pre-wrap; overflow-wrap: anywhere; }

  .dots { display: inline-flex; align-items: center; }
  .dots i { display: inline-block; width: 5px; height: 5px; margin: 0 2px; border-radius: 50%; background: var(--warn-dot); animation: qpDot 1.2s infinite ease-in-out; }
  .dots i:nth-child(2) { animation-delay: .15s; } .dots i:nth-child(3) { animation-delay: .3s; }
  @keyframes qpDot { 0%, 80%, 100% { opacity: .3; transform: translateY(0); } 40% { opacity: 1; transform: translateY(-3px); } }
  .fadein { animation: qpIn .3s cubic-bezier(.2,.7,.3,1); }
  @keyframes qpIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
  .toast { position: fixed; left: 50%; bottom: 28px; transform: translateX(-50%); z-index: 10; background: var(--toast); color: var(--toast-fg); border-radius: 12px; padding: 10px 16px; font-size: 13.5px; font-weight: 500; box-shadow: 0 10px 30px rgba(0,0,0,.25); max-width: calc(100vw - 32px); animation: qpToast .3s cubic-bezier(.2,.7,.3,1); }
  @keyframes qpToast { from { opacity: 0; transform: translate(-50%, 10px); } to { opacity: 1; transform: translate(-50%, 0); } }
  ::view-transition-old(root) { animation: none; display: none; }
  ::view-transition-new(root) { animation: none; }
  ::view-transition-group(top) { z-index: 100; animation: none; }
  ::view-transition-old(top) { display: none; }
  ::view-transition-new(top) { animation: none; }
  ::view-transition-group(*) { animation-duration: .32s; animation-timing-function: cubic-bezier(.2,.7,.3,1); }
  ::view-transition-old(*), ::view-transition-new(*) { animation-duration: .22s; }
  ::view-transition-new(*):only-child { animation: qpIn .3s cubic-bezier(.2,.7,.3,1); }
  ::view-transition-old(*):only-child { animation: qpOut .18s ease-in forwards; }
  @keyframes qpOut { to { opacity: 0; transform: scale(.98); } }
  .counts span, .nav-foot > span, .pill, .opt, .opt-key, .btn-primary .badge { transition: color .2s, background-color .2s, border-color .2s; }
  @media (prefers-reduced-motion: reduce) { .fadein, .toast, .dots i, .segs { animation: none; } .segs span { transition: none; } }
`

const FONTS =
  '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&amp;family=JetBrains+Mono:wght@400;500;600&amp;display=swap">'

/** The whole page as the hub serves it: all the hub's languages baked in, `language` (the mod's option) for a hub language it does not know. */
export const webPage = (language: Language): string => {
  const baked = JSON.stringify(WEB_TEXTS).replace(/</g, '\\u003c')

  return [
    `<!doctype html><html lang="${language}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">`,
    `<title>${WEB_TEXTS[language].title} · Claude</title>${FONTS}<style>${STYLE}</style></head><body>`,
    `<header class="top" style="view-transition-name: top"><div class="top-in"><div class="brand"><div class="logo">${ICON.logo}</div><div class="brand-text"><h1 id="title"></h1><span class="sub" id="subtitle"></span></div></div>`,
    `<div class="search">${ICON.search}<input class="field" id="search" type="search" autocomplete="off"></div><span class="conn" id="conn" role="status"></span></div></header>`,
    '<div class="layout"><nav class="side nav-col" id="nav"></nav>',
    '<main class="main-col"><div class="filters" id="filters" role="tablist"></div><div class="list" id="list"></div></main>',
    '<aside class="side out-col" id="outbox"></aside></div><div id="toast"></div>',
    `<script src="/hub.js"></script><script>const TEXTS = ${baked}\nconst FALLBACK = ${JSON.stringify(language)}\n${SCRIPT}</script></body></html>`,
  ].join('\n')
}
