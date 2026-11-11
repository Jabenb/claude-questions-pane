import { expect, mock, test } from 'claude-code/testing'

import { applyReplies, composeAnswers, markSent, parseAsk, rebuild, setDraft } from '../hooks/batch'
import type { TranscriptMessage } from '../hooks/batch'
import { languageOf } from '../hooks/i18n'
import { cutForFork, lastMarker, parseJournal, replay, serialize } from '../hooks/journal'
import type { Change, Entry } from '../hooks/journal'
import { outcomeOf, webPage } from '../hooks/web'

const RU = { options: { language: 'ru' } }

const PANE = {
  plugin: 'questions',
  component: 'Pane',
  requestId: 'questions',
  props: {
    title: 'Вопросы',
    isFocused: false,
    bodyColumns: 60,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 40 },
    view: {},
  },
} as const

const ASK = {
  tool: 'mcp__questions__ask',
  title: 'Checkout flow',
  questions: [{ text: 'Где хранить lead?', options: ['В нашей БД', 'Только в CRM'] }, { text: 'Нужен ли retry?' }, { text: '  ' }],
}

const engine = (on: Parameters<Parameters<typeof test>[1]>[1], submitted: string[]): void => {
  on('ui.open', () => ({ value: { isPlaced: true } }))
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

test('a batch the model asks is answered in the pane and sent with the questions quoted', RU, async ($, on) => {
  const submitted: string[] = []
  engine(on, submitted)

  const asked = await $.tool.call(ASK)
  expect(String(asked.result)).toMatch(/1\.1, 1\.2/)

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.find({ type: 'Text', text: /Q1/ }))?.text).toBe('○ Q1')

  await ui.press({ key: 'o-1.1-0' })
  expect((await ui.find({ type: 'Button', key: 'o-1.1-0' }))?.props.label).toBe('✓ В нашей БД')
  await ui.input({ key: 'a-1.2', text: 'да', kind: 'change' })
  expect((await ui.find({ type: 'Button', key: 'send' }))?.props.label).toBe('Отправить все ответы (1)')

  await ui.press({ key: 'send' })
  expect(submitted).toEqual([
    'Ответы из панели вопросов «Checkout flow»:\n\n**[1.1] Q1. Где хранить lead?**\n→ В нашей БД\n\n**[1.2] Q2. Нужен ли retry?**\n→ да\n\n' +
      '_Claude: ответь через mcp__questions__reply на каждый из 1.1, 1.2 — resolved: true, только если ответ окончательный; false — если пункт оставлен открытым или ты переспрашиваешь._',
  ])
  expect((await ui.find({ type: 'Text', text: /Q1/ }))?.text).toBe('… Q1')
  expect(await ui.find({ key: 'a-1.1' })).toBe(undefined)

  await $.tool.call({ tool: 'mcp__questions__reply', replies: [{ id: '1.1', text: 'Ок, синк джобой' }] })
  expect((await ui.find({ type: 'Text', text: /Q1/ }))?.text).toBe('✓ Q1')
  expect((await ui.find({ type: 'Text', text: /синк джобой/ }))?.text).toBe('Claude: Ок, синк джобой')

  await ui.unmount()
})

test('answers without a reply ride on every later prompt and in the reply result until each one is replied', RU, async ($, on) => {
  const contexts: (readonly string[] | undefined)[] = []
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('prompt.submit', (_, e) => {
    contexts.push(e.context)

    return { text: e.text }
  })
  await $.tool.call(ASK)

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'o-1.1-0' })
  await ui.input({ key: 'a-1.2', text: 'да', kind: 'change' })
  await ui.press({ key: 'send' })
  expect(contexts[0]).toBe(undefined)

  const partial = await $.tool.call({ tool: 'mcp__questions__reply', replies: [{ id: '1.1', text: 'Ок' }] })
  expect(String(partial.result)).toBe('1 replies shown in the pane. Still without your reply: 1.2 — reply to each of them too.')

  await $.prompt.submit({ text: 'а дальше?' })
  expect(contexts[1]?.at(-1)).toMatch(/answered 1\.2 and/)

  const rest = await $.tool.call({ tool: 'mcp__questions__reply', replies: [{ id: '1.2', text: 'Оставил открытым' }] })
  expect(String(rest.result)).toBe('1 replies shown in the pane.')
  expect((await ui.find({ type: 'Text', text: /Q2/ }))?.text).toBe('✓ Q2')

  await $.prompt.submit({ text: 'ок' })
  expect(contexts[2]).toBe(undefined)
  await ui.unmount()
})

test('a typed answer is kept in state once the focus leaves the field', RU, async ($, on) => {
  engine(on, [])
  on('ui.focus', () => ({ value: { isFocused: true } }))
  await $.tool.call(ASK)

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.input({ key: 'a-1.2', text: 'да', kind: 'change' })
  expect((await ui.find({ type: 'Text', text: /Q2/ }))?.text).toBe('○ Q2')

  await $.ui.focus({ requestId: 'questions', key: 'send' })
  expect((await ui.find({ type: 'Text', text: /Q2/ }))?.text).toBe('● Q2')
  expect((await ui.find({ type: 'Button', key: 'send' }))?.props.label).toBe('Отправить все ответы (1)')
  await ui.unmount()
})

test('a batch is hidden whole, answered or not', RU, async ($, on) => {
  engine(on, [])
  await $.tool.call(ASK)
  await $.tool.call({ ...ASK, title: 'Второй' })

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'hide-1' })

  expect(await ui.find({ type: 'Text', text: /Checkout flow/ })).toBe(undefined)
  expect((await ui.find({ type: 'Text', text: /Второй/ }))?.text).toBe('Второй')

  const third = await $.tool.call({ ...ASK, title: 'Третий' })
  expect(String(third.result)).toMatch(/3\.1, 3\.2/)

  await ui.press({ key: 'hide-3' })
  const fourth = await $.tool.call({ ...ASK, title: 'Четвёртый' })
  expect(String(fourth.result)).toMatch(/4\.1, 4\.2/)
  await ui.unmount()
})

test('the footer keeps what is beneath and adds the pane icon', RU, async ($, on) => {
  engine(on, [])
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>Моды 3/3</Text>
  })

  const footer = { plugin: 'questions', component: 'SessionMode', surface: 'desktop', props: { modes: [] } } as const
  const ui = await $.ui.mount(footer)
  expect((await ui.find({ type: 'Text', text: /Моды/ }))?.text).toBe('Моды 3/3')
  expect((await ui.find({ type: 'Button', key: 'questions' }))?.props.label).toBe('❓')
  await ui.press({ key: 'questions' })
  await ui.unmount()
})

test('nothing to send is said, not submitted', RU, async ($, on) => {
  const submitted: string[] = []
  engine(on, submitted)
  await $.tool.call(ASK)

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'send' })

  expect(submitted).toEqual([])
  await ui.unmount()
})

test('an empty ask is refused', async $ => {
  const asked = await $.tool.call({ tool: 'mcp__questions__ask', questions: [] })

  expect(asked.deny).toMatch(/No questions/)
})

test('mobile shows the questions without fields', RU, async ($, on) => {
  engine(on, [])
  await $.tool.call(ASK)

  const ui = await $.ui.mount({ ...PANE, surface: 'mobile' })

  expect((await ui.find({ type: 'Text', text: /Нужен ли retry/ }))?.text).toBe('Нужен ли retry?')
  expect((await ui.find({ type: 'Text', text: /поля ввода нет/ }))).toBeDefined()
  await ui.unmount()
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

/** The session's id, clock, files, store and host commands, held in memory. */
const disk = (on: Parameters<Parameters<typeof test>[1]>[1], sessionId = OWN, files: Record<string, string> = {}): Disk => {
  const held: Disk = { files: new Map(Object.entries(files)), mtimes: new Map(), runs: [], store: new Map(), chats: [OWN], now: 100 * DAY, isWritable: true }
  on('session.id', () => ({ value: sessionId }))
  on('env.get', (_, e) => ({ value: e.name === 'HOME' ? '/home/u' : undefined }))
  on('clock.now', () => ({ value: held.now }))
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

test('the transcript tells the pane again: asks, answers, replies', async () => {
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

test('a session started with an empty pane restores it from the transcript and numbers on from there', RU, async ($, on) => {
  engine(on, [])
  started(on)
  const held = disk(on)
  on('session.messages', () => ({ value: TRANSCRIPT }))
  await $.session.start({ cwd: '/w', surface: 'desktop', isInteractive: true })

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.find({ type: 'Text', text: /Q1/ }))?.text).toBe('✓ Q1')
  expect((await ui.find({ type: 'Text', text: /Q2/ }))?.text).toBe('○ Q2')
  expect((await ui.find({ type: 'Text', text: /три попытки/ }))?.text).toBe('Ты: да,\nтри попытки')

  const next = await $.tool.call(ASK)
  expect(String(next.result)).toMatch(/ids 4\.1, 4\.2/)
  expect(lines(held.files.get(`${DIR}/${OWN}.jsonl`)).map(entry => entry.op)).toEqual(['snapshot', 'ask'])
  await ui.unmount()
})

test('a session started with questions in its state does not read the transcript', RU, async ($, on) => {
  let reads = 0
  engine(on, [])
  started(on)
  const held = disk(on)
  on('session.messages', () => {
    reads += 1

    return { value: TRANSCRIPT }
  })
  await $.tool.call(ASK)
  await $.session.start({ cwd: '/w', surface: 'desktop', isInteractive: true })

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(reads).toBe(0)
  expect(lines(held.files.get(`${DIR}/${OWN}.jsonl`)).map(entry => entry.op)).toEqual(['snapshot'])
  expect(await ui.find({ key: 'a-3.1' })).toBe(undefined)
  expect((await ui.find({ key: 'a-1.1' }))?.type).toBe('Input')
  await ui.unmount()
})

test('a batch is sent alone and folds down to its header', RU, async ($, on) => {
  const submitted: string[] = []
  engine(on, submitted)
  await $.tool.call(ASK)
  await $.tool.call({ ...ASK, title: 'Второй' })

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'o-1.1-0' })
  await ui.press({ key: 'o-2.1-1' })
  expect((await ui.find({ type: 'Button', key: 'send-1' }))?.props.label).toBe('Отправить (1)')

  await ui.press({ key: 'send-2' })
  expect(submitted[0]).toMatch(/^Ответы из панели вопросов «Второй»:\n\n\*\*\[2\.1\][^\n]*\*\*\n→ Только в CRM\n\n_Claude: .* 2\.1 —/)
  expect((await ui.find({ type: 'Button', key: 'o-1.1-0' }))?.props.label).toBe('✓ В нашей БД')
  expect(await ui.find({ key: 'send-2' })).toBe(undefined)

  await ui.press({ key: 'fold-1' })
  expect((await ui.find({ type: 'Button', key: 'fold-1' }))?.props.label).toBe('▸')
  expect(await ui.find({ key: 'o-1.1-0' })).toBe(undefined)
  expect((await ui.find({ type: 'Button', key: 'send-1' }))?.props.label).toBe('Отправить (1)')

  await ui.press({ key: 'fold-1' })
  expect((await ui.find({ type: 'Button', key: 'o-1.1-0' }))?.props.label).toBe('✓ В нашей БД')
  await ui.unmount()
})

test('a resolved question is opened again for a new answer, its thread kept', RU, async ($, on) => {
  const submitted: string[] = []
  engine(on, submitted)
  await $.tool.call(ASK)

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'o-1.1-0' })
  await ui.press({ key: 'send-1' })
  await $.tool.call({ tool: 'mcp__questions__reply', replies: [{ id: '1.1', text: 'Принял' }] })
  expect(await ui.find({ key: 'reopen-1.2' })).toBe(undefined)

  await ui.press({ key: 'reopen-1.1' })
  expect((await ui.find({ type: 'Text', text: /Q1/ }))?.text).toBe('○ Q1')
  expect((await ui.find({ type: 'Text', text: /Принял/ }))?.text).toBe('Claude: Принял')

  await ui.press({ key: 'o-1.1-1' })
  await ui.press({ key: 'send-1' })
  expect(submitted[1]).toMatch(/\*\*\[1\.1\][^\n]*\*\*\n→ Только в CRM/)
  await ui.unmount()
})

test('an open question that was discussed is resolved by hand, a fresh one is not offered it', RU, async ($, on) => {
  engine(on, [])
  await $.tool.call(ASK)

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'o-1.1-0' })
  await ui.press({ key: 'send-1' })
  await $.tool.call({ tool: 'mcp__questions__reply', replies: [{ id: '1.1', text: 'Принял' }] })
  await ui.press({ key: 'reopen-1.1' })
  expect(await ui.find({ key: 'resolve-1.2' })).toBe(undefined)

  await ui.press({ key: 'resolve-1.1' })
  expect((await ui.find({ type: 'Text', text: /Q1/ }))?.text).toBe('✓ Q1')
  expect((await ui.find({ type: 'Button', key: 'reopen-1.1' }))?.props.label).toBe('↺ переоткрыть')
  expect(await ui.find({ key: 'a-1.1' })).toBe(undefined)
  await ui.unmount()
})

test('english is the default: the pane, the answers message and its footer', async ($, on) => {
  const submitted: string[] = []
  engine(on, submitted)
  on('ui.focus', () => ({ value: { isFocused: true } }))
  await $.tool.call(ASK)

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.input({ key: 'a-1.2', text: 'yes', kind: 'change' })
  await $.ui.focus({ requestId: 'questions', key: 'send' })
  expect((await ui.find({ type: 'Button', key: 'send' }))?.props.label).toBe('Send all answers (1)')
  expect((await ui.find({ type: 'Button', key: 'hide-1' }))?.props.label).toBe('Hide')

  await ui.press({ key: 'send' })
  expect(submitted).toEqual([
    'Answers from the Questions pane «Checkout flow»:\n\n**[1.2] Q2. Нужен ли retry?**\n→ yes\n\n' +
      '_Claude: reply with mcp__questions__reply to each of 1.2 — resolved: true only when the answer is final; false when the point is left open or you ask back._',
  ])
  await ui.unmount()
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

test('the buttons of a question follow Claude\'s follow-up', RU, async ($, on) => {
  engine(on, [])
  await $.tool.call(ASK)

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'o-1.1-0' })
  await ui.press({ key: 'send-1' })
  await $.tool.call({ tool: 'mcp__questions__reply', replies: [{ id: '1.1', text: 'Какая CRM?', resolved: false, options: ['HubSpot', 'Salesforce', 'Своя'] }] })

  expect((await ui.find({ type: 'Button', key: 'o-1.1-0' }))?.props.label).toBe('HubSpot')
  expect((await ui.find({ type: 'Button', key: 'o-1.1-2' }))?.props.label).toBe('Своя')

  await $.tool.call({ tool: 'mcp__questions__reply', replies: [{ id: '1.1', text: 'А зачем?', resolved: false }] })
  expect(await ui.find({ key: 'o-1.1-0' })).toBe(undefined)
  expect((await ui.find({ key: 'a-1.1' }))?.type).toBe('Input')
  await ui.unmount()
})

test('a question or a whole batch is copied with its thread, options and drafts', RU, async ($, on) => {
  const copied: string[] = []
  const toasts: string[] = []
  let isCopying = true
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('prompt.submit', (_, e) => ({ text: e.text }))
  on('ui.toast', (_, e) => {
    toasts.push(e.text)

    return { value: undefined }
  })
  on('ui.copy', (_, e) => {
    copied.push(e.text)

    return { value: isCopying ? { isCopied: true } : { isCopied: false, reason: 'no-clipboard' } }
  })
  await $.tool.call(ASK)

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'o-1.1-0' })
  await ui.press({ key: 'send-1' })
  await $.tool.call({ tool: 'mcp__questions__reply', replies: [{ id: '1.1', text: 'Какая CRM?', resolved: false, options: ['HubSpot'] }] })
  await ui.input({ key: 'a-1.2', text: 'черн', kind: 'change' })

  await ui.press({ key: 'copy-1.1' })
  await ui.press({ key: 'copy-1' })
  isCopying = false
  await ui.press({ key: 'copy-1.2' })

  expect(copied).toEqual([
    '«Checkout flow»\n\n[1.1] Q1. Где хранить lead?\nТы: В нашей БД\nClaude: Какая CRM?\nВарианты: HubSpot',
    '«Checkout flow»\n\n[1.1] Q1. Где хранить lead?\nТы: В нашей БД\nClaude: Какая CRM?\nВарианты: HubSpot\n\n[1.2] Q2. Нужен ли retry?\nЧерновик: черн',
    '«Checkout flow»\n\n[1.2] Q2. Нужен ли retry?\nЧерновик: черн',
  ])
  expect(toasts).toEqual(['Скопировано', 'Скопировано', 'Не скопировалось: no-clipboard'])
  await ui.unmount()
})

test('a journal replays to the pane it wrote, a broken line skipped', async () => {
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
  const held = disk(on)
  await $.session.start({ cwd: '/w', surface: 'desktop', isInteractive: true })
  expect(held.files.has(`${DIR}/${OWN}.jsonl`)).toBe(false)

  const asked = await $.tool.call(ASK)
  expect(String(asked.result)).toMatch(/ids 1\.1, 1\.2\)\..* ‹q:aaaaaaaa#1›$/)

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'o-1.1-0' })
  await ui.press({ key: 'send-1' })
  expect(submitted[0]).toMatch(/_Claude: .*_ ‹q:aaaaaaaa#3›$/)

  const replied = await $.tool.call({ tool: 'mcp__questions__reply', replies: [{ id: '1.1', text: 'Принял' }] })
  expect(String(replied.result)).toBe('1 replies shown in the pane. ‹q:aaaaaaaa#4›')
  await ui.press({ key: 'fold-1' })
  await ui.press({ key: 'hide-1' })

  expect(lines(held.files.get(`${DIR}/${OWN}.jsonl`)).map(entry => `${entry.seq}:${entry.op}`)).toEqual(['1:ask', '2:draft', '3:sent', '4:reply', '5:fold', '6:hide'])
  await ui.unmount()
})

test('a session reopened with its file gets back hidden batches, folds, drafts and statuses set by hand', RU, async ($, on) => {
  engine(on, [])
  started(on)
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

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(reads).toBe(0)
  expect(await ui.find({ type: 'Text', text: /Checkout flow/ })).toBe(undefined)
  expect((await ui.find({ type: 'Text', text: /Q1/ }))?.text).toBe('✓ Q1')

  const next = await $.tool.call(ASK)
  expect(String(next.result)).toMatch(/ids 3\.1, 3\.2\)\..* ‹q:aaaaaaaa#10›$/)
  await ui.unmount()
})

test('a fork starts from the parent file cut at the marker its history ends on', RU, async ($, on) => {
  const parent = 'pppppppp-1111-2222-3333-444444444444'
  const fork = 'ffffffff-1111-2222-3333-444444444444'
  engine(on, [])
  started(on)
  on('session.messages', () => ({ value: [asked('2 questions are shown (ids 1.1, 1.2). ‹q:pppppppp#1›')] }))
  const held = disk(on, fork, {
    [`${DIR}/${parent}.jsonl`]: journalOf([
      { op: 'ask', batch: parseAsk(ASK, 1, 'ru')!, ts: 10 },
      { op: 'draft', id: '1.1', text: 'В нашей БД', ts: 20 },
      { op: 'sent', ts: 30 },
    ]),
  })
  await $.session.start({ cwd: '/w', surface: 'desktop', isInteractive: true })

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.find({ type: 'Text', text: /Q1/ }))?.text).toBe('● Q1')
  expect((await ui.find({ type: 'Button', key: 'o-1.1-0' }))?.props.label).toBe('✓ В нашей БД')

  const own = lines(held.files.get(`${DIR}/${fork}.jsonl`))
  expect(own.map(entry => entry.op)).toEqual(['snapshot'])
  expect(own[0]?.op === 'snapshot' && own[0].from).toEqual({ sessionId: 'pppppppp', seq: 1 })
  expect(lines(held.files.get(`${DIR}/${parent}.jsonl`))).toHaveLength(3)
  await ui.unmount()
})

test('a fork whose parent file is gone is told from its history', RU, async ($, on) => {
  engine(on, [])
  started(on)
  on('session.messages', () => ({ value: [asked('shown (ids 3.1, 3.2). ‹q:pppppppp#1›')] }))
  const held = disk(on, 'ffffffff-1111-2222-3333-444444444444')
  await $.session.start({ cwd: '/w', surface: 'desktop', isInteractive: true })

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.find({ type: 'Text', text: /Q1/ }))?.text).toBe('○ Q1')
  expect([...held.files.keys()]).toEqual([`${DIR}/ffffffff-1111-2222-3333-444444444444.jsonl`])
  await ui.unmount()
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

test('a pane whose file cannot be written keeps working from memory', RU, async ($, on) => {
  engine(on, [])
  started(on)
  on('session.messages', () => ({ value: [] }))
  const held = disk(on)
  held.isWritable = false
  await $.session.start({ cwd: '/w', surface: 'desktop', isInteractive: true })

  const asked = await $.tool.call(ASK)
  expect(String(asked.result)).toMatch(/wait: the answers arrive as one message\.$/)

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.find({ type: 'Text', text: /Q1/ }))?.text).toBe('○ Q1')
  await ui.unmount()
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

test('a press on the browser page comes to the changes the buttons of the pane make', async () => {
  const batch = parseAsk(ASK, 1)!
  const sent = markSent(setDraft([batch], '1.1', 'В нашей БД'))

  expect(outcomeOf({ type: 'draft', id: '1.2', text: 'да' }, [batch])).toEqual({ changes: [{ op: 'draft', id: '1.2', text: 'да' }], send: null })
  expect(outcomeOf({ type: 'send', drafts: { '1.1': 'В нашей БД', '1.2': '', '9.9': 'x' } }, [batch])).toEqual({ changes: [{ op: 'draft', id: '1.1', text: 'В нашей БД' }], send: {} })
  expect(outcomeOf({ type: 'send', only: '1', drafts: {} }, [batch])).toEqual({ changes: [], send: { only: '1' } })
  expect(outcomeOf({ type: 'hide', batchId: '1' }, [batch])).toEqual({ changes: [{ op: 'hide', batchId: '1' }], send: null })
  expect(outcomeOf({ type: 'draft', id: '1.1', text: 'поздно' }, sent).changes).toEqual([])
})

test('a press naming nothing the pane holds comes to nothing', async () => {
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

type HubCalls = { pages: number; pushed: Array<{ batches: Array<{ questions: Array<{ id: string; draft: string; status: string }> }> }>; queue: unknown[][] }

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

test('with the hub mod loaded the pane is mirrored to the browser page and answers sent from there reach Claude', RU, async ($, on) => {
  const submitted: string[] = []
  engine(on, submitted)
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

  await $.tool.call(ASK)
  expect(held.pushed.at(-1)?.batches[0]?.questions.map(question => question.id)).toEqual(['1.1', '1.2'])

  held.queue.push([{ type: 'send', drafts: { '1.2': 'да, 3 попытки' } }])
  await clock.advance(1000)

  expect(submitted[0]).toMatch(/\*\*\[1\.2\] Q2\. Нужен ли retry\?\*\*\n→ да, 3 попытки/)
  expect(held.pushed.at(-1)?.batches[0]?.questions.map(question => question.status)).toEqual(['open', 'sent'])
})
