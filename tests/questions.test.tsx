import { expect, mock, test } from 'claude-code/testing'

import { applyReplies, composeAnswers, markSent, parseAsk, rebuild, setDraft } from '../hooks/batch'
import type { TranscriptMessage } from '../hooks/batch'
import { languageOf } from '../hooks/i18n'
import { cutForFork, lastMarker, parseJournal, replay, serialize } from '../hooks/journal'
import type { Change, Entry } from '../hooks/journal'
import { outcomeOf, webPage } from '../hooks/web'

const RU = { options: { language: 'ru' } }

const ASK = {
  tool: 'mcp__questions__ask',
  title: 'Checkout flow',
  questions: [{ text: 'Где хранить lead?', options: ['В нашей БД', 'Только в CRM'] }, { text: 'Нужен ли retry?' }, { text: '  ' }],
}

/** A row the session left in the chat, without the marker that ends it. */
const bare = (text: unknown): string => String(text).replace(/ ‹q:\w+#\d+›$/, '')

const engine = (on: Parameters<Parameters<typeof test>[1]>[1], submitted: string[]): void => {
  on('ui.toast', () => ({ value: undefined }))
  on('prompt.submit', (_, e) => {
    submitted.push(e.text)

    return { text: e.text }
  })
}

test('questions are numbered per batch and blank ones are skipped', async () => {
  const batch = parseAsk(ASK, 2)

  expect(batch?.questions.map(q => q.id)).toEqual(['2.1', '2.2'])
  expect(batch?.questions[0]?.options).toEqual(['В нашей БД', 'Только в CRM'])
  expect(parseAsk({ questions: [] }, 1)).toBe(null)
})

test('the sent message keeps each answer under its question and skips unanswered ones', async () => {
  const batch = parseAsk(ASK, 1)!
  const drafted = setDraft([batch], '1.2', ' да, 3 попытки ')

  expect(composeAnswers(drafted, undefined, 'ru')).toBe('Ответы из панели вопросов «Checkout flow»:\n\n**[1.2] Q2. Нужен ли retry?**\n→ да, 3 попытки')
  expect(composeAnswers(markSent(drafted), undefined, 'ru')).toBe('')
})

test('an unresolved reply opens the question again, unknown ids are reported', async () => {
  const sent = markSent(setDraft([parseAsk(ASK, 1)!], '1.1', 'В нашей БД'))
  const { batches, unknown } = applyReplies(sent, [
    { id: '1.1', text: 'А синк в CRM чем?', isResolved: false },
    { id: '9.9', text: 'x', isResolved: true },
  ])

  expect(batches[0]?.questions[0]?.status).toBe('open')
  expect(batches[0]?.questions[0]?.thread.map(entry => entry.from)).toEqual(['user', 'claude'])
  expect(unknown).toEqual(['9.9'])
})

test('a batch the model asks is answered on the page and sent with the questions quoted', RU, async ($, on) => {
  const submitted: string[] = []
  engine(on, submitted)
  const page = await live($, on)

  const asked = await $.tool.call(ASK)
  expect(String(asked.result)).toMatch(/on the questions page \(http:\/\/localhost:7777\/p\/questions\/s\) \(ids 1\.1, 1\.2\)/)
  expect(page.questions().map(question => question.status)).toEqual(['open', 'open'])

  await page.press({ type: 'draft', id: '1.1', text: 'В нашей БД' }, { type: 'send', drafts: { '1.2': 'да' } })
  expect(submitted.map(bare)).toEqual([
    'Ответы из панели вопросов «Checkout flow»:\n\n**[1.1] Q1. Где хранить lead?**\n→ В нашей БД\n\n**[1.2] Q2. Нужен ли retry?**\n→ да\n\n' +
      '_Claude: ответь через mcp__questions__reply на каждый из 1.1, 1.2 — resolved: true, только если ответ окончательный; false — если пункт оставлен открытым или ты переспрашиваешь._',
  ])
  expect(page.questions().map(question => question.status)).toEqual(['sent', 'sent'])

  await $.tool.call({ tool: 'mcp__questions__reply', replies: [{ id: '1.1', text: 'Ок, синк джобой' }] })
  expect(page.questions()[0]?.status).toBe('resolved')
  expect(page.questions()[0]?.thread.at(-1)).toEqual({ from: 'claude', text: 'Ок, синк джобой' })
})

test('answers without a reply ride on every later prompt and in the reply result until each one is replied', RU, async ($, on) => {
  const contexts: (readonly string[] | undefined)[] = []
  on('prompt.submit', (_, e) => {
    contexts.push(e.context)

    return { text: e.text }
  })
  const page = await live($, on)
  await $.tool.call(ASK)

  await page.press({ type: 'send', drafts: { '1.1': 'В нашей БД', '1.2': 'да' } })
  expect(contexts[0]).toBe(undefined)

  const partial = await $.tool.call({ tool: 'mcp__questions__reply', replies: [{ id: '1.1', text: 'Ок' }] })
  expect(bare(partial.result)).toBe('1 replies shown on the page. Still without your reply: 1.2 — reply to each of them too.')

  await $.prompt.submit({ text: 'а дальше?' })
  expect(contexts[1]?.at(-1)).toMatch(/answered 1\.2 and/)

  const rest = await $.tool.call({ tool: 'mcp__questions__reply', replies: [{ id: '1.2', text: 'Оставил открытым' }] })
  expect(bare(rest.result)).toBe('1 replies shown on the page.')
  expect(page.questions()[1]?.status).toBe('resolved')

  await $.prompt.submit({ text: 'ок' })
  expect(contexts[2]).toBe(undefined)
})

test('a draft typed on the page is kept in state', RU, async ($, on) => {
  engine(on, [])
  const page = await live($, on)
  await $.tool.call(ASK)

  await page.press({ type: 'draft', id: '1.2', text: 'да' })
  expect(page.questions().map(question => [question.draft, question.status])).toEqual([['', 'open'], ['да', 'open']])
})

test('a batch is hidden whole, answered or not', RU, async ($, on) => {
  engine(on, [])
  const page = await live($, on)
  await $.tool.call(ASK)
  await $.tool.call({ ...ASK, title: 'Второй' })

  await page.press({ type: 'draft', id: '1.1', text: 'В нашей БД' }, { type: 'hide', batchId: '1' })
  expect(page.batchIds()).toEqual(['2'])

  const third = await $.tool.call({ ...ASK, title: 'Третий' })
  expect(String(third.result)).toMatch(/3\.1, 3\.2/)

  await page.press({ type: 'hide', batchId: '3' })
  const fourth = await $.tool.call({ ...ASK, title: 'Четвёртый' })
  expect(String(fourth.result)).toMatch(/4\.1, 4\.2/)
})

test('the command gives the address of the page, or says the hub does not answer', RU, async ($, on) => {
  engine(on, [])
  await live($, on)

  expect((await $.command.run({ command: 'questions', args: '' })).text).toBe('Страница вопросов: http://localhost:7777/p/questions/s')
})

test('without the hub the questions are still kept and the command says so', RU, async ($, on) => {
  engine(on, [])
  started(on)
  on('session.messages', () => ({ value: [] }))
  disk(on)
  await $.session.start({ cwd: '/w', surface: 'desktop', isInteractive: true })

  const asked = await $.tool.call(ASK)
  expect(String(asked.result)).toMatch(/shown on the questions page \(ids 1\.1, 1\.2\)/)
  expect((await $.command.run({ command: 'questions', args: '' })).text).toBe('Хаб webhub не отвечает: страница вопросов сейчас недоступна.')
})

test('nothing to send is said, not submitted', RU, async ($, on) => {
  const submitted: string[] = []
  engine(on, submitted)
  const page = await live($, on)
  await $.tool.call(ASK)

  await page.press({ type: 'send', drafts: {} })

  expect(submitted).toEqual([])
})

test('an empty ask is refused', async $ => {
  const asked = await $.tool.call({ tool: 'mcp__questions__ask', questions: [] })

  expect(asked.deny).toMatch(/No questions/)
})

test('the guide is added to the system prompt', RU, async ($, on) => {
  on('prompt.compose', () => ({ sections: [{ id: 'intro', text: 'intro', scope: 'shared' }] }))

  const composed = await $.prompt.compose({ model: 'm', promptModel: 'm', surfaces: ['desktop'], tools: [], outputStyle: null, traits: [] })

  expect(composed.sections.map(section => section.id)).toEqual(['intro', 'questions:guide'])
})

const started = (on: Parameters<Parameters<typeof test>[1]>[1]): void => {
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('command.register', () => ({ value: undefined }))
  on('tool.register', () => ({ value: undefined }))
}

const DIR = '/home/u/.claude/mods-data/questions'
const OWN = 'aaaaaaaa-1111-2222-3333-444444444444'
const DAY = 24 * 60 * 60 * 1000

type Disk = { files: Map<string, string>; mtimes: Map<string, number>; runs: string[][]; store: Map<string, unknown>; chats: string[]; now: number; isWritable: boolean }

/** The session's id, clock, files, store and host commands, held in memory; `isClockOwn: false` leaves the clock to `mock.clock`. */
const disk = (on: Parameters<Parameters<typeof test>[1]>[1], sessionId = OWN, files: Record<string, string> = {}, isClockOwn = true): Disk => {
  const held: Disk = { files: new Map(Object.entries(files)), mtimes: new Map(), runs: [], store: new Map(), chats: [OWN], now: 100 * DAY, isWritable: true }
  on('session.id', () => ({ value: sessionId }))
  on('env.get', (_, e) => ({ value: e.name === 'HOME' ? '/home/u' : undefined }))

  if (isClockOwn) {
    on('clock.now', () => ({ value: held.now }))
  }

  on('fs.exists', (_, e) => ({ value: held.files.has(e.path) }))
  on('fs.read', (_, e) => {
    if (!held.files.has(e.path)) {
      throw new Error(`ENOENT ${e.path}`)
    }

    return { value: held.files.get(e.path)! }
  })
  on('fs.write', (_, e) => {
    if (!held.isWritable) {
      throw new Error('EACCES')
    }

    held.files.set(e.path, e.text)

    return { value: undefined }
  })
  on('fs.list', (_, e) => ({
    value: [...held.files.keys()]
      .filter(path => path.startsWith(`${e.path}/`))
      .map(path => ({ name: path.slice(e.path.length + 1), kind: 'file' as const, size: held.files.get(path)!.length, mtimeMs: held.mtimes.get(path) ?? held.now, isLink: false })),
  }))
  on('store.get', (_, e) => ({ value: held.store.get(e.key) }))
  on('store.set', (_, e) => {
    held.store.set(e.key, e.value)

    return { value: undefined }
  })
  on('process.run', (_, e) => {
    held.runs.push([...e.argv])

    if (e.argv[0] === 'rm') {
      e.argv.slice(2).forEach(path => held.files.delete(path))
    }

    const stdout = e.argv[0] === 'find' ? held.chats.map(id => `/home/u/.claude/projects/-w/${id}.jsonl`).join('\n') : ''

    return { value: { exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })

  return held
}

const journalOf = (changes: (Change & { ts?: number })[], firstSeq = 1): string =>
  changes.map((change, index) => serialize({ ts: 10 * (index + 1), ...change, seq: firstSeq + index } as Entry)).join('')

const lines = (text: string | undefined): Entry[] => parseJournal(text ?? '')

const asked = (text: string, input: Record<string, unknown> = ASK): TranscriptMessage => ({
  role: 'assistant',
  text: '',
  toolUses: [{ tool: 'mcp__questions__ask', input, text }],
})

const replied = (replies: { id: string; text: string; resolved?: boolean; options?: string[] }[]): TranscriptMessage => ({
  role: 'assistant',
  text: '',
  toolUses: [{ tool: 'mcp__questions__reply', input: { replies }, text: 'ok' }],
})

const TRANSCRIPT: TranscriptMessage[] = [
  { role: 'user', text: 'начнём', toolUses: [] },
  asked('2 questions are shown in the Questions pane (ids 3.1, 3.2). End your turn now and wait: the answers arrive as one message.'),
  {
    role: 'user',
    text:
      'Ответы из панели вопросов «Checkout flow»:\n\n**[3.1] Q1. Где хранить lead?**\n→ В нашей БД\n\n**[3.2] Q2. Нужен ли retry?**\n→ да,\nтри попытки\n\n' +
      '_Claude: ответь через mcp__questions__reply на каждый из 3.1, 3.2 — resolved: true, только если ответ окончательный; false — если пункт оставлен открытым или ты переспрашиваешь._',
    toolUses: [],
  },
  replied([{ id: '3.1', text: 'Принял' }, { id: '3.2', text: 'Сколько ждать между попытками?', resolved: false }]),
]

test('the transcript tells the questions again: asks, answers, replies', async () => {
  const told = rebuild(TRANSCRIPT)
  const [first, second] = told.batches[0]!.questions

  expect(told.lastBatchNo).toBe(3)
  expect(told.batches.map(batch => batch.id)).toEqual(['3'])
  expect(first?.status).toBe('resolved')
  expect(first?.thread).toEqual([{ from: 'user', text: 'В нашей БД' }, { from: 'claude', text: 'Принял' }])
  expect(second?.status).toBe('open')
  expect(second?.thread).toEqual([{ from: 'user', text: 'да,\nтри попытки' }, { from: 'claude', text: 'Сколько ждать между попытками?' }])
})

test('a refused ask is skipped and an ask without ids in its result takes the next number', async () => {
  const told = rebuild([
    { role: 'assistant', text: '', toolUses: [{ tool: 'mcp__questions__ask', input: ASK, text: 'No questions given', isError: true }] },
    asked('shown'),
  ])

  expect(told.batches.map(batch => batch.questions.map(question => question.id))).toEqual([['1.1', '1.2']])
  expect(told.lastBatchNo).toBe(1)
  expect(rebuild([])).toEqual({ batches: [], lastBatchNo: 0 })
})

test('a session started with nothing restores the questions from the transcript and numbers on from there', RU, async ($, on) => {
  engine(on, [])
  started(on)
  const held = disk(on)
  const page = hub(on)
  on('session.messages', () => ({ value: TRANSCRIPT }))
  await $.session.start({ cwd: '/w', surface: 'desktop', isInteractive: true })

  const shown = page.pushed.at(-1)?.batches[0]?.questions
  expect(shown?.map(question => question.status)).toEqual(['resolved', 'open'])
  expect(shown?.[1]?.thread[0]).toEqual({ from: 'user', text: 'да,\nтри попытки' })

  const next = await $.tool.call(ASK)
  expect(String(next.result)).toMatch(/ids 4\.1, 4\.2/)
  expect(lines(held.files.get(`${DIR}/${OWN}.jsonl`)).map(entry => entry.op)).toEqual(['snapshot', 'ask'])
})

test('a session started with questions in its state does not read the transcript', RU, async ($, on) => {
  let reads = 0
  engine(on, [])
  started(on)
  const held = disk(on)
  const page = hub(on)
  on('session.messages', () => {
    reads += 1

    return { value: TRANSCRIPT }
  })
  await $.tool.call(ASK)
  await $.session.start({ cwd: '/w', surface: 'desktop', isInteractive: true })

  expect(reads).toBe(0)
  expect(lines(held.files.get(`${DIR}/${OWN}.jsonl`)).map(entry => entry.op)).toEqual(['snapshot'])
  expect(page.pushed.at(-1)?.batches.flatMap(batch => batch.questions.map(question => question.id))).toEqual(['1.1', '1.2'])
})

test('a batch is sent alone and the other keeps its drafts', RU, async ($, on) => {
  const submitted: string[] = []
  engine(on, submitted)
  const page = await live($, on)
  await $.tool.call(ASK)
  await $.tool.call({ ...ASK, title: 'Второй' })

  await page.press({ type: 'send', only: '2', drafts: { '1.1': 'В нашей БД', '2.1': 'Только в CRM' } })
  expect(submitted[0]).toMatch(/^Ответы из панели вопросов «Второй»:\n\n\*\*\[2\.1\][^\n]*\*\*\n→ Только в CRM\n\n_Claude: .* 2\.1 —/)
  expect(page.questions().map(question => [question.id, question.status, question.draft])).toEqual([
    ['1.1', 'open', 'В нашей БД'],
    ['1.2', 'open', ''],
    ['2.1', 'sent', ''],
    ['2.2', 'open', ''],
  ])
})

test('a resolved question is opened again for a new answer, its thread kept', RU, async ($, on) => {
  const submitted: string[] = []
  engine(on, submitted)
  const page = await live($, on)
  await $.tool.call(ASK)

  await page.press({ type: 'send', only: '1', drafts: { '1.1': 'В нашей БД' } })
  await $.tool.call({ tool: 'mcp__questions__reply', replies: [{ id: '1.1', text: 'Принял' }] })
  await page.press({ type: 'reopen', id: '1.2' }, { type: 'reopen', id: '1.1' })
  expect(page.questions().map(question => question.status)).toEqual(['open', 'open'])
  expect(page.questions()[0]?.thread.at(-1)).toEqual({ from: 'claude', text: 'Принял' })

  await page.press({ type: 'send', only: '1', drafts: { '1.1': 'Только в CRM' } })
  expect(submitted[1]).toMatch(/\*\*\[1\.1\][^\n]*\*\*\n→ Только в CRM/)
})

test('an open question is resolved by hand and takes no answer after that', RU, async ($, on) => {
  engine(on, [])
  const page = await live($, on)
  await $.tool.call(ASK)

  await page.press({ type: 'resolve', id: '1.1' }, { type: 'draft', id: '1.1', text: 'поздно' })
  expect(page.questions().map(question => [question.status, question.draft])).toEqual([['resolved', ''], ['open', '']])
})

test('english is the default: the answers message and its footer', async ($, on) => {
  const submitted: string[] = []
  engine(on, submitted)
  const page = await live($, on)
  await $.tool.call(ASK)

  await page.press({ type: 'send', drafts: { '1.2': 'yes' } })
  expect(submitted.map(bare)).toEqual([
    'Answers from the Questions pane «Checkout flow»:\n\n**[1.2] Q2. Нужен ли retry?**\n→ yes\n\n' +
      '_Claude: reply with mcp__questions__reply to each of 1.2 — resolved: true only when the answer is final; false when the point is left open or you ask back._',
  ])
  expect((await $.command.run({ command: 'questions', args: '' })).text).toBe('Questions page: http://localhost:7777/p/questions/s')
})

test('the transcript is read whatever language its answers were sent in', async () => {
  const told = rebuild([
    asked('shown (ids 1.1, 1.2)'),
    {
      role: 'user',
      text: 'Answers from the Questions pane «Checkout flow»:\n\n**[1.1] Q1. Где хранить lead?**\n→ our DB\n\nAnswers from the Questions pane «Other»:\n\n**[9.1] Q1. x**\n→ y',
      toolUses: [],
    },
  ])

  expect(told.batches[0]?.questions[0]?.thread).toEqual([{ from: 'user', text: 'our DB' }])
  expect(told.batches[0]?.questions[0]?.status).toBe('sent')
  expect(told.batches[0]?.questions[1]?.status).toBe('open')
  expect(parseAsk({ questions: ['q'] }, 5)?.title).toBe('Questions 5')
  expect(languageOf('de')).toBe('en')
})

test('an unresolved reply brings the options of its follow-up, a resolved one keeps the old', async () => {
  const sent = markSent(setDraft(setDraft([parseAsk(ASK, 1)!], '1.1', 'В нашей БД'), '1.2', 'да'))
  const { batches } = applyReplies(sent, [
    { id: '1.1', text: 'Какая CRM?', isResolved: false, options: ['HubSpot', 'Salesforce'] },
    { id: '1.2', text: 'Сколько попыток?', isResolved: false, options: [] },
  ])
  const resolved = applyReplies(sent, [{ id: '1.1', text: 'Принял', isResolved: true, options: ['x'] }]).batches

  expect(batches[0]?.questions.map(question => question.options)).toEqual([['HubSpot', 'Salesforce'], []])
  expect(resolved[0]?.questions[0]?.options).toEqual(['В нашей БД', 'Только в CRM'])
  expect(rebuild([asked('shown (ids 1.1, 1.2)'), replied([{ id: '1.1', text: 'Какая CRM?', resolved: false, options: ['HubSpot'] }])]).batches[0]?.questions[0]?.options).toEqual(['HubSpot'])
})

test('the options of a question follow Claude\'s follow-up', RU, async ($, on) => {
  engine(on, [])
  const page = await live($, on)
  await $.tool.call(ASK)

  await page.press({ type: 'send', only: '1', drafts: { '1.1': 'В нашей БД' } })
  await $.tool.call({ tool: 'mcp__questions__reply', replies: [{ id: '1.1', text: 'Какая CRM?', resolved: false, options: ['HubSpot', 'Salesforce', 'Своя'] }] })
  expect(page.questions()[0]?.options).toEqual(['HubSpot', 'Salesforce', 'Своя'])

  await $.tool.call({ tool: 'mcp__questions__reply', replies: [{ id: '1.1', text: 'А зачем?', resolved: false }] })
  expect(page.questions()[0]?.options).toEqual([])
  expect(page.questions()[0]?.status).toBe('open')
})

test('a journal replays to the state it wrote, a broken line skipped', async () => {
  const batch = parseAsk(ASK, 1, 'ru')!
  const second = { ...parseAsk(ASK, 2, 'ru')!, title: 'Второй' }
  const text = journalOf([
    { op: 'ask', batch },
    { op: 'ask', batch: second },
    { op: 'draft', id: '1.1', text: 'В нашей БД' },
    { op: 'sent', only: '1' },
    { op: 'reply', replies: [{ id: '1.1', text: 'Какая CRM?', isResolved: false, options: ['HubSpot'] }] },
    { op: 'draft', id: '1.2', text: 'черн' },
    { op: 'fold', batchId: '1' },
    { op: 'hide', batchId: '2' },
  ])
  const state = replay(parseJournal(`${text}{"op":"draft","seq":`))

  expect(state.lastBatchNo).toBe(2)
  expect(state.batches.map(one => one.id)).toEqual(['1'])
  expect(state.collapsed).toEqual(['1'])
  expect(state.batches[0]?.questions.map(question => [question.status, question.draft, question.options])).toEqual([
    ['open', '', ['HubSpot']],
    ['open', 'черн', []],
  ])
})

test('a fork takes the parent up to its marker and the quiet changes before the fork', async () => {
  const entries = parseJournal(
    journalOf([
      { op: 'ask', batch: parseAsk(ASK, 1, 'ru')!, ts: 10 },
      { op: 'draft', id: '1.1', text: 'В нашей БД', ts: 20 },
      { op: 'sent', ts: 30 },
      { op: 'reply', replies: [{ id: '1.1', text: 'Принял', isResolved: true, options: [] }], ts: 40 },
      { op: 'hide', batchId: '1', ts: 50 },
    ]),
  )
  const seqs = (cut: Entry[] | null): number[] | null => cut?.map(entry => entry.seq) ?? null

  expect(seqs(cutForFork(entries, 1, 100))).toEqual([1, 2])
  expect(seqs(cutForFork(entries, 1, 15))).toEqual([1])
  expect(seqs(cutForFork(entries, 4, 100))).toEqual([1, 2, 3, 4, 5])
  expect(seqs(cutForFork(entries, 4, 45))).toEqual([1, 2, 3, 4])
  expect(cutForFork(parseJournal(journalOf([{ op: 'snapshot', state: replay(entries) }], 5)), 3, 100)).toBe(null)
  expect(lastMarker('a ‹q:pppppppp#1› b ‹q:qqqqqqqq#7› c')).toEqual({ sessionId: 'qqqqqqqq', seq: 7 })
  expect(lastMarker('none')).toBe(null)
})

test('every change is written to the session file and marks what reaches the chat', RU, async ($, on) => {
  const submitted: string[] = []
  engine(on, submitted)
  started(on)
  on('session.messages', () => ({ value: [] }))
  const held = disk(on, OWN, {}, false)
  const page = hub(on)
  const clock = mock.clock(on, { now: held.now })
  await $.session.start({ cwd: '/w', surface: 'desktop', isInteractive: true })
  expect(held.files.has(`${DIR}/${OWN}.jsonl`)).toBe(false)

  const asked = await $.tool.call(ASK)
  expect(String(asked.result)).toMatch(/ids 1\.1, 1\.2\)\..* ‹q:aaaaaaaa#1›$/)

  page.queue.push([{ type: 'draft', id: '1.1', text: 'В нашей БД' }, { type: 'send', only: '1', drafts: {} }])
  await clock.advance(1000)
  expect(submitted[0]).toMatch(/_Claude: .*_ ‹q:aaaaaaaa#3›$/)

  const replied = await $.tool.call({ tool: 'mcp__questions__reply', replies: [{ id: '1.1', text: 'Принял' }] })
  expect(String(replied.result)).toBe('1 replies shown on the page. ‹q:aaaaaaaa#4›')

  page.queue.push([{ type: 'hide', batchId: '1' }])
  await clock.advance(1000)
  expect(lines(held.files.get(`${DIR}/${OWN}.jsonl`)).map(entry => `${entry.seq}:${entry.op}`)).toEqual(['1:ask', '2:draft', '3:sent', '4:reply', '5:hide'])
})

test('a session reopened with its file gets back hidden batches, drafts and statuses set by hand', RU, async ($, on) => {
  engine(on, [])
  started(on)
  const page = hub(on)
  let reads = 0
  on('session.messages', () => {
    reads += 1

    return { value: TRANSCRIPT }
  })
  disk(on, OWN, {
    [`${DIR}/${OWN}.jsonl`]: journalOf([
      { op: 'ask', batch: parseAsk(ASK, 1, 'ru')! },
      { op: 'ask', batch: { ...parseAsk(ASK, 2, 'ru')!, title: 'Второй' } },
      { op: 'draft', id: '1.2', text: 'черн' },
      { op: 'hide', batchId: '1' },
      { op: 'draft', id: '2.1', text: 'В нашей БД' },
      { op: 'sent' },
      { op: 'reply', replies: [{ id: '2.1', text: 'Принял', isResolved: true, options: [] }] },
      { op: 'reopen', id: '2.1' },
      { op: 'resolve', id: '2.1' },
    ]),
  })
  await $.session.start({ cwd: '/w', surface: 'desktop', isInteractive: true })

  expect(reads).toBe(0)
  expect(page.pushed.at(-1)?.batches.map(batch => batch.id)).toEqual(['2'])
  expect(page.pushed.at(-1)?.batches[0]?.questions.map(question => question.status)).toEqual(['resolved', 'open'])

  const next = await $.tool.call(ASK)
  expect(String(next.result)).toMatch(/ids 3\.1, 3\.2\)\..* ‹q:aaaaaaaa#10›$/)
})

test('a fork starts from the parent file cut at the marker its history ends on', RU, async ($, on) => {
  const parent = 'pppppppp-1111-2222-3333-444444444444'
  const fork = 'ffffffff-1111-2222-3333-444444444444'
  engine(on, [])
  started(on)
  const page = hub(on)
  on('session.messages', () => ({ value: [asked('2 questions are shown (ids 1.1, 1.2). ‹q:pppppppp#1›')] }))
  const held = disk(on, fork, {
    [`${DIR}/${parent}.jsonl`]: journalOf([
      { op: 'ask', batch: parseAsk(ASK, 1, 'ru')!, ts: 10 },
      { op: 'draft', id: '1.1', text: 'В нашей БД', ts: 20 },
      { op: 'sent', ts: 30 },
    ]),
  })
  await $.session.start({ cwd: '/w', surface: 'desktop', isInteractive: true })

  expect(page.pushed.at(-1)?.batches[0]?.questions[0]).toMatchObject({ status: 'open', draft: 'В нашей БД' })

  const own = lines(held.files.get(`${DIR}/${fork}.jsonl`))
  expect(own.map(entry => entry.op)).toEqual(['snapshot'])
  expect(own[0]?.op === 'snapshot' && own[0].from).toEqual({ sessionId: 'pppppppp', seq: 1 })
  expect(lines(held.files.get(`${DIR}/${parent}.jsonl`))).toHaveLength(3)
})

test('a fork whose parent file is gone is told from its history', RU, async ($, on) => {
  engine(on, [])
  started(on)
  on('session.messages', () => ({ value: [asked('shown (ids 3.1, 3.2). ‹q:pppppppp#1›')] }))
  const held = disk(on, 'ffffffff-1111-2222-3333-444444444444')
  const page = hub(on)
  await $.session.start({ cwd: '/w', surface: 'desktop', isInteractive: true })

  expect(page.pushed.at(-1)?.batches[0]?.questions.map(question => [question.id, question.status])).toEqual([['3.1', 'open'], ['3.2', 'open']])
  expect([...held.files.keys()]).toEqual([`${DIR}/ffffffff-1111-2222-3333-444444444444.jsonl`])
})

test('a session with nothing to restore makes no file until its first change', RU, async ($, on) => {
  engine(on, [])
  started(on)
  on('session.messages', () => ({ value: [{ role: 'user', text: 'привет', toolUses: [] }] }))
  const held = disk(on)
  await $.session.start({ cwd: '/w', surface: 'desktop', isInteractive: true })

  expect([...held.files.keys()]).toEqual([])
})

test('a long journal is rewritten as one snapshot and keeps counting', RU, async ($, on) => {
  engine(on, [])
  started(on)
  const drafts: Change[] = Array.from({ length: 498 }, (_, index) => ({ op: 'draft', id: '1.2', text: `v${index}` }))
  const held = disk(on, OWN, { [`${DIR}/${OWN}.jsonl`]: journalOf([{ op: 'ask', batch: parseAsk(ASK, 1, 'ru')! }, ...drafts]) })
  await $.session.start({ cwd: '/w', surface: 'desktop', isInteractive: true })

  const asked = await $.tool.call(ASK)
  expect(String(asked.result)).toMatch(/‹q:aaaaaaaa#500›$/)

  const compacted = lines(held.files.get(`${DIR}/${OWN}.jsonl`))
  expect(compacted.map(entry => `${entry.seq}:${entry.op}`)).toEqual(['500:snapshot'])
  expect(replay(compacted).batches.map(batch => batch.id)).toEqual(['1', '2'])
  expect(replay(compacted).batches[0]?.questions[1]?.draft).toBe('v497')

  await $.tool.call({ ...ASK, title: 'Ещё' })
  expect(lines(held.files.get(`${DIR}/${OWN}.jsonl`)).map(entry => `${entry.seq}:${entry.op}`)).toEqual(['500:snapshot', '501:ask'])
})

test('questions whose file cannot be written keep working from memory', RU, async ($, on) => {
  engine(on, [])
  started(on)
  on('session.messages', () => ({ value: [] }))
  const page = hub(on)
  const held = disk(on)
  held.isWritable = false
  await $.session.start({ cwd: '/w', surface: 'desktop', isInteractive: true })

  const asked = await $.tool.call(ASK)
  expect(String(asked.result)).toMatch(/wait: the answers arrive as one message\.$/)

  expect(page.pushed.at(-1)?.batches[0]?.questions.map(question => question.status)).toEqual(['open', 'open'])
})

test('once a day the files of chats already removed and untouched for 30 days are deleted', RU, async ($, on) => {
  engine(on, [])
  started(on)
  on('session.messages', () => ({ value: [] }))
  const gone = `${DIR}/dddddddd-0000-0000-0000-000000000000.jsonl`
  const fresh = `${DIR}/eeeeeeee-0000-0000-0000-000000000000.jsonl`
  const kept = `${DIR}/kkkkkkkk-0000-0000-0000-000000000000.jsonl`
  const held = disk(on, OWN, { [gone]: '', [fresh]: '', [kept]: '' })
  held.chats = [OWN, 'kkkkkkkk-0000-0000-0000-000000000000']
  held.mtimes.set(gone, held.now - 31 * DAY)
  held.mtimes.set(fresh, held.now - DAY)
  held.mtimes.set(kept, held.now - 40 * DAY)

  await $.session.start({ cwd: '/w', surface: 'desktop', isInteractive: true })
  expect(held.runs.filter(argv => argv[0] === 'rm')).toEqual([['rm', '-f', gone]])
  expect([...held.files.keys()].sort()).toEqual([fresh, kept].sort())

  held.files.set(gone, '')
  await $.session.start({ cwd: '/w', surface: 'desktop', isInteractive: true })
  expect(held.runs.filter(argv => argv[0] === 'find')).toHaveLength(1)

  held.now += DAY
  held.chats = []
  await $.session.start({ cwd: '/w', surface: 'desktop', isInteractive: true })
  expect(held.runs.filter(argv => argv[0] === 'find')).toHaveLength(2)
  expect(held.files.has(gone)).toBe(true)
})

test('a press on the page comes to the changes it names', async () => {
  const batch = parseAsk(ASK, 1)!
  const sent = markSent(setDraft([batch], '1.1', 'В нашей БД'))

  expect(outcomeOf({ type: 'draft', id: '1.2', text: 'да' }, [batch])).toEqual({ changes: [{ op: 'draft', id: '1.2', text: 'да' }], send: null })
  expect(outcomeOf({ type: 'send', drafts: { '1.1': 'В нашей БД', '1.2': '', '9.9': 'x' } }, [batch])).toEqual({ changes: [{ op: 'draft', id: '1.1', text: 'В нашей БД' }], send: {} })
  expect(outcomeOf({ type: 'send', only: '1', drafts: {} }, [batch])).toEqual({ changes: [], send: { only: '1' } })
  expect(outcomeOf({ type: 'hide', batchId: '1' }, [batch])).toEqual({ changes: [{ op: 'hide', batchId: '1' }], send: null })
  expect(outcomeOf({ type: 'draft', id: '1.1', text: 'поздно' }, sent).changes).toEqual([])
})

test('a press naming nothing the questions hold comes to nothing', async () => {
  const batch = parseAsk(ASK, 1)!

  expect(outcomeOf({ type: 'send', only: '7', drafts: { '1.1': 'x' } }, [batch])).toEqual({ changes: [], send: null })
  expect(outcomeOf({ type: 'hide', batchId: '7' }, [batch]).changes).toEqual([])
  expect(outcomeOf({ type: 'resolve', id: '1.1' }, [batch]).changes).toEqual([{ op: 'resolve', id: '1.1' }])
  expect(outcomeOf({ type: 'reopen', id: '1.1' }, [batch]).changes).toEqual([])
  expect(outcomeOf({ type: 'launch' }, [batch])).toEqual({ changes: [], send: null })
  expect(outcomeOf(null, [batch])).toEqual({ changes: [], send: null })
})

test('the browser page carries its language and no markup from its texts', async () => {
  expect(webPage('ru')).toMatch(/<html lang="ru">/)
  expect(webPage('ru')).toMatch(/const FALLBACK = "ru"/)
  expect(webPage('en')).toMatch(/"sendAll":"Send all answers"/)
  expect(webPage('en')).toMatch(/"sendAll":"Отправить все ответы"/)
  expect(webPage('en')).toMatch(/"sendAll":"Надіслати всі відповіді"/)
  expect(webPage('en')).toMatch(/<script src="\/hub\.js"><\/script>/)
  expect(webPage('en')).not.toMatch(/href="\/"/)
})

type Shown = { id: string; draft: string; status: string; options: string[]; thread: Array<{ from: string; text: string }> }
type HubCalls = { pages: number; pushed: Array<{ batches: Array<{ id: string; questions: Shown[] }> }>; queue: unknown[][] }

/** The `webhub` mod's noun, held in memory: `queue` is what the page's presses hand to each pull. */
const hub = (on: Parameters<Parameters<typeof test>[1]>[1]): HubCalls => {
  const held: HubCalls = { pages: 0, pushed: [], queue: [] }
  on('engine.create', async (_, e, next) => ({
    ...(await next(e)),
    webhub: {
      page: async () => {
        held.pages += 1

        return { isUp: true, url: 'http://localhost:7777/p/questions/s' }
      },
      push: async ({ state }: { state: unknown }) => {
        held.pushed.push(state as HubCalls['pushed'][number])

        return { isUp: true }
      },
      pull: async () => ({ isUp: true, isStale: false, isRegistered: true, actions: (held.queue.shift() ?? []).map((data, index) => ({ id: index + 1, data })) }),
    },
  }))
  return held
}

type Page = { held: HubCalls; press: (...actions: unknown[]) => Promise<void>; questions: () => Shown[]; batchIds: () => string[] }

/** A started session with the hub held in memory: `press` hands the page's actions to the next round of listening. */
const live = async ($: Parameters<Parameters<typeof test>[1]>[0], on: Parameters<Parameters<typeof test>[1]>[1]): Promise<Page> => {
  started(on)
  on('session.messages', () => ({ value: [] }))
  on('session.id', () => ({ value: OWN }))
  on('env.get', () => ({ value: undefined }))
  on('fs.exists', () => ({ value: false }))
  on('fs.write', () => ({ value: undefined }))
  on('store.get', () => ({ value: 100 * DAY }))
  const held = hub(on)
  const clock = mock.clock(on, { now: 100 * DAY })
  await $.session.start({ cwd: '/w', surface: 'desktop', isInteractive: true })
  expect(held.pages).toBe(1)

  return {
    held,
    press: async (...actions) => {
      held.queue.push(actions)
      await clock.advance(1000)
    },
    questions: () => (held.pushed.at(-1)?.batches ?? []).flatMap(batch => batch.questions),
    batchIds: () => (held.pushed.at(-1)?.batches ?? []).map(batch => batch.id),
  }
}
