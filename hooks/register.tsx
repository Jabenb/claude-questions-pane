import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import { languageOf, TEXTS } from './i18n'
import type { Language } from './i18n'
import { applyReplies, awaitingReply, composeAnswers, parseAsk, parseReplies, rebuild, replyFooter, replyReminder } from './batch'
import { applyChange, COMPACT_AT, cutForFork, lastMarker, marker, parseJournal, replay, serialize } from './journal'
import type { Change, Entry, PaneState } from './journal'
import { outcomeOf, WEB_MOD, webPage, webState } from './web'

const COMMAND = 'questions'
const ASK = 'mcp__questions__ask'
const REPLY = 'mcp__questions__reply'

const batches = atom({ plugin: 'questions', key: 'batches' } as const, [], { shape: 'batches-1' })
/** Only grows: a hidden batch's number is never given again, so its ids in the chat history stay its own. */
const lastBatchNo = atom({ plugin: 'questions', key: 'lastBatchNo' } as const, 0)
/** Ids of folded batches: kept for the files of earlier versions, the page does not fold. */
const collapsed = atom({ plugin: 'questions', key: 'collapsed' } as const, [])

const GUIDE = [
  '# Questions page',
  `When you need the user to decide more than two things (implementation questions, open points of a feature, clarifications), do not write them as a numbered list in chat: call ${ASK} with all of them, each with its options when there are obvious ones, then end your turn with one short line saying the questions are on the questions page in the browser. Keep each question self-contained: it is read alone, next to its own answer field.`,
  `The user's answers arrive as one message where every answer sits under its question, tagged with its id like [1.3]. Reply to every answered id with ${REPLY} before the turn ends, not only the ones you discuss in chat: a question stays unresolved on the page until it gets your reply. resolved: true only when the answer is a final decision; resolved: false when the user leaves the point open or undecided, or when your reply asks the user something back; when that follow-up has obvious answers, pass them as the reply's options (they replace the question's old buttons). In chat, never refer to a question by its bare number: open each point with the question's short title and quote the user's answer, e.g. "**Q3 · Where to keep the lead** — you: «in our DB» → …".`,
].join('\n\n')

/** This session's file, known from `session.start` on; null until then (and under a test that starts no session). */
let journal: { sessionId: string; dir: string; path: string; text: string; seq: number; count: number } | null = null

/** Changes run one at a time: each reads the state the one before it left, and appends after it. */
let queue: Promise<unknown> = Promise.resolve()

const serial = <T,>(work: () => Promise<T>): Promise<T> => {
  const run = queue.then(work, work)
  queue = run.catch(() => undefined)

  return run
}

/** One load of this module: the hub hands the page's actions to the newest one only. */
const LISTENER = `${Date.now()}-${Math.random().toString(36).slice(2)}`
const PULL_WAIT_MS = 5000
const HUB_RETRY_MS = 15_000

/** The page on the hub: its address once registered, and where the listening stands. */
let web = { url: '', isFirstPull: true, isStale: false, pullingSince: 0, downSince: 0 }

/** Shows the state on the page; with the hub down it does nothing, and the page is registered again once the hub is back. */
const pushWeb = async ($: EngineInterface, state: PaneState): Promise<void> => {
  if (web.url === '') {
    return
  }

  try {
    await $.webhub.push({ mod: WEB_MOD, state: webState(state) })
  } catch {
    return
  }
}

const readPane = async ($: EngineInterface): Promise<PaneState> => ({
  batches: await read($, batches),
  lastBatchNo: await read($, lastBatchNo),
  collapsed: await read($, collapsed),
})

const writePane = async ($: EngineInterface, state: PaneState): Promise<void> => {
  await update($, batches, () => state.batches)
  await update($, lastBatchNo, () => state.lastBatchNo)
  await update($, collapsed, () => state.collapsed)
}

/** Appends the change to the session's file, as one snapshot once the file has grown long; a failed write leaves the pane working from memory. */
const persist = async ($: EngineInterface, change: Change, state: PaneState): Promise<number | null> => {
  if (journal === null) {
    return null
  }

  try {
    const entry = { ...change, seq: journal.seq + 1, ts: await $.clock.now() } as Entry
    const isCompacting = journal.count + 1 >= COMPACT_AT
    const text = isCompacting ? serialize({ op: 'snapshot', state, seq: entry.seq, ts: entry.ts }) : journal.text + serialize(entry)
    await $.fs.write(journal.path, text)
    journal = { ...journal, text, seq: entry.seq, count: isCompacting ? 1 : journal.count + 1 }

    return entry.seq
  } catch {
    return null
  }
}

/** Applies one change to the pane and writes it down; resolves the new state and the marker for the chat ('' with no file). */
const dispatch = ($: EngineInterface, change: Change): Promise<{ state: PaneState; mark: string }> =>
  serial(async () => {
    const state = applyChange(await readPane($), change)
    await writePane($, state)
    const seq = await persist($, change, state)
    await pushWeb($, state)

    return { state, mark: seq === null || journal === null ? '' : marker(journal.sessionId, seq) }
  })

const send = async ($: EngineInterface, language: Language, only?: string): Promise<void> => {
  const list = await read($, batches)
  const text = composeAnswers(list, only, language)

  if (text === '') {
    $.ui.toast(TEXTS[language].nothingToSend, { timeoutMs: 3000 })

    return
  }

  const { state, mark } = await dispatch($, only === undefined ? { op: 'sent' } : { op: 'sent', only })
  const footer = replyFooter(awaitingReply(state.batches), language)
  await $.prompt.submit({ text: `${text}\n\n${mark === '' ? footer : `${footer} ${mark}`}`, asUser: true })
}

/** Registers the page on the hub and shows the state there; again after the hub lost it. */
const openWeb = async ($: EngineInterface, language: Language): Promise<void> => {
  try {
    const page = await $.webhub.page({ mod: WEB_MOD, title: TEXTS[language].pageTitle, html: webPage(language), icon: '❓' })
    web = { ...web, url: page.isUp ? page.url : '', downSince: page.isUp ? 0 : Date.now() }
  } catch {
    web = { ...web, url: '', downSince: Date.now() }

    return
  }

  await pushWeb($, await readPane($))
}

/** One round of listening to the page: waits a few seconds for what the person pressed there and applies it. */
const listenWeb = async ($: EngineInterface, language: Language): Promise<void> => {
  const now = Date.now()

  if (web.isStale || (web.pullingSince !== 0 && now - web.pullingSince < PULL_WAIT_MS + 10_000) || (web.downSince !== 0 && now - web.downSince < HUB_RETRY_MS)) {
    return
  }

  web.pullingSince = now

  try {
    const pulled = await $.webhub.pull({ mod: WEB_MOD, listener: LISTENER, isFirst: web.isFirstPull, waitMs: PULL_WAIT_MS })
    web.isStale = pulled.isStale
    web.downSince = pulled.isUp ? 0 : Date.now()

    if (!pulled.isUp || pulled.isStale) {
      return
    }

    web.isFirstPull = false

    if (web.url === '' || pulled.isRegistered === false) {
      await openWeb($, language)
    }

    for (const action of pulled.actions) {
      const outcome = outcomeOf(action.data, await read($, batches))

      for (const change of outcome.changes) {
        await dispatch($, change)
      }

      if (outcome.send !== null) {
        await send($, language, outcome.send.only)
      }
    }
  } finally {
    web.pullingSince = 0
  }
}

const readText = async ($: EngineInterface, path: string): Promise<string> => {
  try {
    return (await $.fs.exists(path)) ? String(await $.fs.read(path)) : ''
  } catch {
    return ''
  }
}

const configDir = async ($: EngineInterface): Promise<string> => (await $.env.get('CLAUDE_CONFIG_DIR')) ?? `${(await $.env.get('HOME')) ?? ''}/.claude`

/** The parent's file a fork's marker names, by its id prefix; the fork's own id never counts. */
const parentText = async ($: EngineInterface, dir: string, prefix: string, ownId: string): Promise<string> => {
  try {
    const found = (await $.fs.list(dir)).find(entry => entry.kind === 'file' && entry.name.startsWith(prefix) && entry.name.endsWith('.jsonl') && !entry.name.startsWith(ownId))

    return found === undefined ? '' : await readText($, `${dir}/${found.name}`)
  } catch {
    return ''
  }
}

/**
 * Opens this session's file and puts the questions in state from the first source that has it: the session's own file
 * (a restart or a resume), the state a running session already holds (an update of the mod), the parent's file cut
 * where a fork's history ends, or the chat history itself (sessions from before the files, or a lost file).
 */
const open = async ($: EngineInterface): Promise<void> => {
  const sessionId = await $.session.id()
  const dir = `${await configDir($)}/mods-data/questions`
  const path = `${dir}/${sessionId}.jsonl`
  const own = await readText($, path)

  if (own !== '') {
    const entries = parseJournal(own)
    journal = { sessionId, dir, path, text: own, seq: entries.at(-1)?.seq ?? 0, count: entries.length }
    await writePane($, replay(entries))

    return
  }

  journal = { sessionId, dir, path, text: '', seq: 0, count: 0 }
  const live = await readPane($)

  if (live.batches.length > 0 || live.lastBatchNo > 0) {
    await dispatch($, { op: 'snapshot', state: live })

    return
  }

  const messages = await $.session.messages()
  const seen = lastMarker(JSON.stringify(messages))

  if (seen !== null && !sessionId.startsWith(seen.sessionId)) {
    const cut = cutForFork(parseJournal(await parentText($, dir, seen.sessionId, sessionId)), seen.seq, await $.clock.now())

    if (cut !== null) {
      await dispatch($, { op: 'snapshot', state: replay(cut), from: seen })

      return
    }
  }

  const told = rebuild(messages)

  if (told.batches.length > 0) {
    await dispatch($, { op: 'snapshot', state: { ...told, collapsed: [] } })
  }
}

const DAY = 24 * 60 * 60 * 1000

/**
 * Once a day: deletes the files of sessions whose chat Claude Code has already removed (it keeps them
 * `cleanupPeriodDays`, 30 by default) and that were not touched for 30 days. Nothing is deleted when the chats cannot be listed.
 */
const sweep = async ($: EngineInterface): Promise<void> => {
  try {
    const now = await $.clock.now()

    if (journal === null || now - Number((await $.store.get('lastSweep')) ?? 0) < DAY) {
      return
    }

    await $.store.set('lastSweep', now)
    const listed = await $.process.run(['find', `${await configDir($)}/projects`, '-maxdepth', '2', '-name', '*.jsonl'])
    const chats = new Set(listed.stdout.split('\n').map(line => line.trim().split('/').at(-1)?.replace(/\.jsonl$/, '') ?? '').filter(id => id !== ''))

    if (listed.exitCode !== 0 || chats.size === 0) {
      return
    }

    const stale = (await $.fs.list(journal.dir))
      .filter(entry => entry.kind === 'file' && entry.name.endsWith('.jsonl'))
      .filter(entry => !chats.has(entry.name.replace(/\.jsonl$/, '')) && now - entry.mtimeMs > 30 * DAY)

    if (stale.length > 0) {
      await $.process.run(['rm', '-f', ...stale.map(entry => `${journal!.dir}/${entry.name}`)])
    }
  } catch {
    return
  }
}

export const register: Register = (on, options) => {
  const language = languageOf(options.language)
  journal = null
  web = { url: '', isFirstPull: true, isStale: false, pullingSince: 0, downSince: 0 }
  const texts = TEXTS[language]

  on('session.start', async ($, e, next) => {
    const result = await next(e)
    await $.command.register({ name: COMMAND, description: 'Show the address of the questions page' })
    await $.tool.register({
      name: 'ask',
      description: 'Show a batch of questions for the user on the questions page in the browser, each with its own answer field. Use instead of a numbered list in chat whenever you have more than two questions.',
      isDeferred: false,
      inputSchema: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'What the batch is about, e.g. "Checkout redesign"' },
          questions: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                text: { type: 'string', description: 'The question, self-contained' },
                options: { type: 'array', items: { type: 'string' }, description: 'Ready answers the user can pick' },
              },
              required: ['text'],
            },
          },
        },
        required: ['questions'],
      },
    })
    await $.tool.register({
      name: 'reply',
      description: 'Attach your reply under answered questions on the questions page, by question id like "1.3". Every answered id needs one entry: a question without your reply never shows as resolved.',
      isDeferred: false,
      inputSchema: {
        type: 'object',
        properties: {
          replies: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                text: { type: 'string', description: 'Your reply to the answer, short' },
                resolved: { type: 'boolean', description: 'true (default) only when the answer is a final decision; false when the user leaves the point open or undecided, or when your reply asks the user something back' },
                options: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'With resolved: false, ready answers to your follow-up; they replace the question\'s buttons (none given: the old ones are dropped)',
                },
              },
              required: ['id', 'text'],
            },
          },
        },
        required: ['replies'],
      },
    })

    await open($)
    await sweep($)

    await openWeb($, language)
    $.clock.every(1000, () => void listenWeb($, language).catch(() => undefined))

    return result
  })

  on('prompt.compose', async ($, e, next) => {
    const composed = await next(e)

    return { sections: [...composed.sections, { id: 'questions:guide', text: GUIDE, scope: 'session' }] }
  })

  /** Rides on every later prompt while answers wait; the page's own send says it in its text (see `replyFooter`). */
  on('prompt.submit', async ($, e, next) => {
    const ids = e.command === undefined ? awaitingReply(await read($, batches)) : []

    return next(ids.length === 0 ? e : { ...e, context: [...(e.context ?? []), replyReminder(ids)] })
  })

  on('command.run', { command: COMMAND }, async $ => {
    if (web.url === '') {
      await openWeb($, language)
    }

    return { text: web.url === '' ? texts.hubDown : texts.pageAt(web.url) }
  })

  on('tool.call', { tool: ASK }, async ($, e) => {
    const list = await read($, batches)
    const batchNo = list.reduce((max, batch) => Math.max(max, Number(batch.id) || 0), await read($, lastBatchNo)) + 1
    const batch = parseAsk(e as unknown as Record<string, unknown>, batchNo, language)

    if (batch === null) {
      return { deny: 'No questions given: pass questions as [{ text, options? }].' }
    }

    const { mark } = await dispatch($, { op: 'ask', batch })
    const where = web.url === '' ? 'on the questions page' : `on the questions page (${web.url})`
    const shown = `${batch.questions.length} questions are shown ${where} (ids ${batch.questions.map(q => q.id).join(', ')}). End your turn now and wait: the answers arrive as one message.`

    return { result: mark === '' ? shown : `${shown} ${mark}` }
  })

  on('tool.call', { tool: REPLY }, async ($, e) => {
    const replies = parseReplies(e as unknown as Record<string, unknown>)
    const { unknown } = applyReplies(await read($, batches), replies)
    const { state, mark } = await dispatch($, { op: 'reply', replies })
    const waiting = awaitingReply(state.batches)
    const shown = unknown.length === 0 ? `${replies.length} replies shown on the page.` : `Shown; no question with ids ${unknown.join(', ')}.`
    const result = waiting.length === 0 ? shown : `${shown} Still without your reply: ${waiting.join(', ')} — reply to each of them too.`

    return { result: mark === '' ? result : `${result} ${mark}` }
  })
}
