import { expect, test } from 'claude-code/testing'

import { applyReplies, composeAnswers, markSent, parseAsk, rebuild, setDraft } from '../hooks/batch'
import type { TranscriptMessage } from '../hooks/batch'
import { languageOf } from '../hooks/i18n'

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
  on('session.messages', () => ({ value: TRANSCRIPT }))
  await $.session.start({ cwd: '/w', surface: 'desktop', isInteractive: true })

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.find({ type: 'Text', text: /Q1/ }))?.text).toBe('✓ Q1')
  expect((await ui.find({ type: 'Text', text: /Q2/ }))?.text).toBe('○ Q2')
  expect((await ui.find({ type: 'Text', text: /три попытки/ }))?.text).toBe('Ты: да,\nтри попытки')

  const next = await $.tool.call(ASK)
  expect(String(next.result)).toMatch(/ids 4\.1, 4\.2/)
  await ui.unmount()
})

test('a session started with questions in its state does not read the transcript', RU, async ($, on) => {
  let reads = 0
  engine(on, [])
  started(on)
  on('session.messages', () => {
    reads += 1

    return { value: TRANSCRIPT }
  })
  await $.tool.call(ASK)
  await $.session.start({ cwd: '/w', surface: 'desktop', isInteractive: true })

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(reads).toBe(0)
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
