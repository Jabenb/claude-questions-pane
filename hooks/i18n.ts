export type Language = 'en' | 'ru'

export type Texts = {
  paneTitle: string
  opened: string
  nothingToSend: string
  emptyTitle: string
  emptyHint: string
  defaultBatchTitle: (batchNo: number) => string
  answersHeader: string
  replyFooter: (ids: string) => string
  stats: (total: number, answered: number, resolved: number) => string
  sendBatch: (count: number) => string
  sendAll: (count: number) => string
  hide: string
  clearResolved: string
  reopen: string
  resolveByHand: string
  hintResolved: string
  hintWaiting: string
  hintAnswered: string
  hintEmpty: string
  you: string
  ownAnswer: string
  answer: string
  noInput: string
  footer: (waiting: number, resolved: number, total: number) => string
}

export const TEXTS: Record<Language, Texts> = {
  en: {
    paneTitle: 'Questions',
    opened: 'Questions pane opened.',
    nothingToSend: 'No answers to send',
    emptyTitle: 'No questions yet',
    emptyHint: 'Claude posts its questions here, each with its own answer field.',
    defaultBatchTitle: batchNo => `Questions ${batchNo}`,
    answersHeader: 'Answers from the Questions pane «',
    replyFooter: ids => `_Claude: reply with mcp__questions__reply to each of ${ids} — resolved: true only when the answer is final; false when the point is left open or you ask back._`,
    stats: (total, answered, resolved) => `${total} questions · answered ${answered} · resolved ${resolved}`,
    sendBatch: count => `Send (${count})`,
    sendAll: count => `Send all answers (${count})`,
    hide: 'Hide',
    clearResolved: 'Clear resolved',
    reopen: '↺ reopen',
    resolveByHand: '✓ resolved',
    hintResolved: 'resolved',
    hintWaiting: 'waiting for Claude',
    hintAnswered: 'answered',
    hintEmpty: 'no answer',
    you: 'You',
    ownAnswer: 'Or your own answer…',
    answer: 'Your answer…',
    noInput: 'No input fields on this device: answer from a computer.',
    footer: (waiting, resolved, total) => `ready to send: ${waiting} · resolved ${resolved}/${total}`,
  },
  ru: {
    paneTitle: 'Вопросы',
    opened: 'Панель вопросов открыта.',
    nothingToSend: 'Нет ответов для отправки',
    emptyTitle: 'Вопросов пока нет',
    emptyHint: 'Claude выложит сюда вопросы по фиче: каждый со своим полем ответа.',
    defaultBatchTitle: batchNo => `Вопросы ${batchNo}`,
    answersHeader: 'Ответы из панели вопросов «',
    replyFooter: ids => `_Claude: ответь через mcp__questions__reply на каждый из ${ids} — resolved: true, только если ответ окончательный; false — если пункт оставлен открытым или ты переспрашиваешь._`,
    stats: (total, answered, resolved) => `${total} вопр. · с ответом ${answered} · решено ${resolved}`,
    sendBatch: count => `Отправить (${count})`,
    sendAll: count => `Отправить все ответы (${count})`,
    hide: 'Скрыть',
    clearResolved: 'Убрать решённые',
    reopen: '↺ переоткрыть',
    resolveByHand: '✓ решено',
    hintResolved: 'решён',
    hintWaiting: 'ждёт Claude',
    hintAnswered: 'есть ответ',
    hintEmpty: 'без ответа',
    you: 'Ты',
    ownAnswer: 'Или свой ответ…',
    answer: 'Твой ответ…',
    noInput: 'На этом устройстве поля ввода нет: отвечай с компьютера.',
    footer: (waiting, resolved, total) => `готово к отправке: ${waiting} · решено ${resolved}/${total}`,
  },
}

/** The `language` option as installed; anything else falls back to English. */
export const languageOf = (value: unknown): Language => (value === 'ru' ? 'ru' : 'en')

/** Every language's answers header: a transcript may hold messages sent under another setting. */
export const ANSWERS_HEADERS: readonly string[] = Object.values(TEXTS).map(texts => texts.answersHeader)
