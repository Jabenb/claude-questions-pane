export type Language = 'en' | 'ru'

export type Texts = {
  pageTitle: string
  pageAt: (url: string) => string
  hubDown: string
  nothingToSend: string
  defaultBatchTitle: (batchNo: number) => string
  /** Kept as worded since the first version: the transcript of an older session is read by it. */
  answersHeader: string
  replyFooter: (ids: string) => string
}

export const TEXTS: Record<Language, Texts> = {
  en: {
    pageTitle: 'Questions',
    pageAt: url => `Questions page: ${url}`,
    hubDown: 'The webhub hub does not answer: the questions page is not available now.',
    nothingToSend: 'No answers to send',
    defaultBatchTitle: batchNo => `Questions ${batchNo}`,
    answersHeader: 'Answers from the Questions pane «',
    replyFooter: ids => `_Claude: reply with mcp__questions__reply to each of ${ids} — resolved: true only when the answer is final; false when the point is left open or you ask back._`,
  },
  ru: {
    pageTitle: 'Вопросы',
    pageAt: url => `Страница вопросов: ${url}`,
    hubDown: 'Хаб webhub не отвечает: страница вопросов сейчас недоступна.',
    nothingToSend: 'Нет ответов для отправки',
    defaultBatchTitle: batchNo => `Вопросы ${batchNo}`,
    answersHeader: 'Ответы из панели вопросов «',
    replyFooter: ids => `_Claude: ответь через mcp__questions__reply на каждый из ${ids} — resolved: true, только если ответ окончательный; false — если пункт оставлен открытым или ты переспрашиваешь._`,
  },
}

/** The hub's own languages: the browser page follows the one chosen in the hub, not the `language` option. */
export type WebLanguage = 'en' | 'ru' | 'uk'

/** The browser page's strings: plain text with `{name}` slots, since the page gets them as JSON. */
export type WebTexts = {
  title: string
  subtitle: string
  search: string
  online: string
  offline: string
  hubDown: string
  batches: string
  allQuestions: string
  keys: string
  filter: string
  fAll: string
  fTodo: string
  fReady: string
  fWaiting: string
  fResolved: string
  send: string
  sendAll: string
  hide: string
  copy: string
  copied: string
  clear: string
  stOpen: string
  stAnswered: string
  stWaiting: string
  stResolved: string
  stAsked: string
  answer: string
  ownAnswer: string
  answerTo: string
  you: string
  variants: string
  resolve: string
  resolveHint: string
  reopen: string
  collapse: string
  expand: string
  typing: string
  sendBatchShort: string
  willSend: string
  draftHint: string
  outbox: string
  outboxEmpty: string
  batchMeta: string
  toAnswer: string
  withClaude: string
  resolvedOf: string
  readyN: string
  nothingReady: string
  kNav: string
  kPick: string
  kEdit: string
  kLeave: string
  kSearch: string
  kSend: string
  emptyTitle: string
  emptyHint: string
  noMatchTitle: string
  noMatchHint: string
  nothingToSend: string
  sent: string
  queued: string
  failed: string
  hidden: string
  cleared: string
}

export const WEB_TEXTS: Record<WebLanguage, WebTexts> = {
  en: {
    title: 'Questions',
    subtitle: 'Decisions Claude is waiting on',
    search: 'Search questions…',
    online: 'Session connected',
    offline: 'Session is not listening',
    hubDown: 'No connection to the hub',
    batches: 'Batches',
    allQuestions: 'All questions',
    keys: 'Keyboard',
    filter: 'Filter',
    fAll: 'All',
    fTodo: 'To answer',
    fReady: 'Ready',
    fWaiting: 'With Claude',
    fResolved: 'Resolved',
    send: 'Send',
    sendAll: 'Send all answers',
    hide: 'Hide',
    copy: 'Copy',
    copied: 'Copied',
    clear: 'Clear resolved',
    stOpen: 'Needs your answer',
    stAnswered: 'Ready to send',
    stWaiting: 'Claude is replying',
    stResolved: 'Resolved',
    stAsked: 'Claude asked back',
    answer: 'Write your answer…',
    ownAnswer: 'Or write your own answer…',
    answerTo: 'Answer to',
    you: 'You',
    variants: 'Suggested answers',
    resolve: 'Resolve',
    resolveHint: 'Mark as resolved without sending',
    reopen: 'Reopen',
    collapse: 'Collapse',
    expand: 'Expand',
    typing: 'Claude is writing…',
    sendBatchShort: 'send batch',
    willSend: 'Will send: ',
    draftHint: 'Pick a suggestion or type: drafts are saved as you go',
    outbox: 'Ready to send',
    outboxEmpty: 'Answer a question and it shows up here, grouped by batch, exactly as Claude will receive it.',
    batchMeta: '{total} questions · {resolved} resolved',
    toAnswer: 'to answer',
    withClaude: 'with Claude',
    resolvedOf: 'resolved',
    readyN: 'Ready: {n}',
    nothingReady: 'Nothing to send yet',
    kNav: 'Next / previous',
    kPick: 'Pick a suggestion',
    kEdit: 'Type an answer',
    kLeave: 'Leave the field',
    kSearch: 'Search',
    kSend: 'Send batch',
    emptyTitle: 'All caught up',
    emptyHint: 'When Claude needs a decision, the questions land here.',
    noMatchTitle: 'Nothing here',
    noMatchHint: 'No questions match this filter or search.',
    nothingToSend: 'No answers to send',
    sent: 'Delivered to Claude: {n}',
    queued: 'Queued: the session is not listening now, it is delivered once it is back.',
    failed: 'Not sent: the hub does not answer.',
    hidden: 'Batch hidden',
    cleared: 'Cleared batches: {n}',
  },
  ru: {
    title: 'Вопросы',
    subtitle: 'Решения, которых ждёт Claude',
    search: 'Поиск по вопросам…',
    online: 'Сессия на связи',
    offline: 'Сессия не слушает',
    hubDown: 'Нет связи с хабом',
    batches: 'Пачки',
    allQuestions: 'Все вопросы',
    keys: 'Клавиши',
    filter: 'Фильтр',
    fAll: 'Все',
    fTodo: 'Ответить',
    fReady: 'Готовы',
    fWaiting: 'У Claude',
    fResolved: 'Решены',
    send: 'Отправить',
    sendAll: 'Отправить все ответы',
    hide: 'Скрыть',
    copy: 'Копировать',
    copied: 'Скопировано',
    clear: 'Убрать решённые',
    stOpen: 'Нужен ваш ответ',
    stAnswered: 'Готово к отправке',
    stWaiting: 'Claude отвечает',
    stResolved: 'Решено',
    stAsked: 'Claude переспросил',
    answer: 'Напишите ответ…',
    ownAnswer: 'Или напишите свой ответ…',
    answerTo: 'Ответ на',
    you: 'Вы',
    variants: 'Готовые варианты',
    resolve: 'Решено',
    resolveHint: 'Отметить решённым без отправки',
    reopen: 'Открыть снова',
    collapse: 'Свернуть',
    expand: 'Развернуть',
    typing: 'Claude пишет…',
    sendBatchShort: 'отправить пачку',
    willSend: 'Уйдёт: ',
    draftHint: 'Выберите вариант или напишите: черновик сохраняется сам',
    outbox: 'К отправке',
    outboxEmpty: 'Ответьте на вопрос, и здесь по пачкам появится ровно то, что получит Claude.',
    batchMeta: 'вопросов: {total} · решено: {resolved}',
    toAnswer: 'ответить',
    withClaude: 'у Claude',
    resolvedOf: 'решено',
    readyN: 'Готово ответов: {n}',
    nothingReady: 'Пока нечего отправлять',
    kNav: 'След. / пред.',
    kPick: 'Выбрать вариант',
    kEdit: 'Написать ответ',
    kLeave: 'Выйти из поля',
    kSearch: 'Поиск',
    kSend: 'Отправить пачку',
    emptyTitle: 'Всё решено',
    emptyHint: 'Когда Claude понадобится решение, вопросы появятся здесь.',
    noMatchTitle: 'Здесь пусто',
    noMatchHint: 'Нет вопросов под этот фильтр или поиск.',
    nothingToSend: 'Нет ответов для отправки',
    sent: 'Доставлено в Claude: {n}',
    queued: 'В очереди: сессия сейчас не слушает, доставится, когда появится.',
    failed: 'Не отправлено: хаб не отвечает.',
    hidden: 'Пачка скрыта',
    cleared: 'Убрано пачек: {n}',
  },
  uk: {
    title: 'Питання',
    subtitle: 'Рішення, на які чекає Claude',
    search: 'Пошук питань…',
    online: 'Сесія на звʼязку',
    offline: 'Сесія не слухає',
    hubDown: 'Немає звʼязку з хабом',
    batches: 'Пачки',
    allQuestions: 'Усі питання',
    keys: 'Клавіші',
    filter: 'Фільтр',
    fAll: 'Усі',
    fTodo: 'Відповісти',
    fReady: 'Готові',
    fWaiting: 'У Claude',
    fResolved: 'Вирішені',
    send: 'Надіслати',
    sendAll: 'Надіслати всі відповіді',
    hide: 'Сховати',
    copy: 'Копіювати',
    copied: 'Скопійовано',
    clear: 'Прибрати вирішені',
    stOpen: 'Потрібна ваша відповідь',
    stAnswered: 'Готово до надсилання',
    stWaiting: 'Claude відповідає',
    stResolved: 'Вирішено',
    stAsked: 'Claude перепитав',
    answer: 'Напишіть відповідь…',
    ownAnswer: 'Або напишіть свою відповідь…',
    answerTo: 'Відповідь на',
    you: 'Ви',
    variants: 'Готові варіанти',
    resolve: 'Вирішено',
    resolveHint: 'Позначити вирішеним без надсилання',
    reopen: 'Відкрити знову',
    collapse: 'Згорнути',
    expand: 'Розгорнути',
    typing: 'Claude пише…',
    sendBatchShort: 'надіслати пачку',
    willSend: 'Піде: ',
    draftHint: 'Оберіть варіант або напишіть: чернетка зберігається сама',
    outbox: 'До надсилання',
    outboxEmpty: 'Дайте відповідь на питання, і тут по пачках зʼявиться саме те, що отримає Claude.',
    batchMeta: 'питань: {total} · вирішено: {resolved}',
    toAnswer: 'відповісти',
    withClaude: 'у Claude',
    resolvedOf: 'вирішено',
    readyN: 'Готово відповідей: {n}',
    nothingReady: 'Поки нічого надсилати',
    kNav: 'Наст. / попер.',
    kPick: 'Обрати варіант',
    kEdit: 'Написати відповідь',
    kLeave: 'Вийти з поля',
    kSearch: 'Пошук',
    kSend: 'Надіслати пачку',
    emptyTitle: 'Усе вирішено',
    emptyHint: 'Коли Claude знадобиться рішення, питання зʼявляться тут.',
    noMatchTitle: 'Тут порожньо',
    noMatchHint: 'Немає питань під цей фільтр або пошук.',
    nothingToSend: 'Немає відповідей для надсилання',
    sent: 'Доставлено в Claude: {n}',
    queued: 'У черзі: сесія зараз не слухає, доставиться, коли зʼявиться.',
    failed: 'Не надіслано: хаб не відповідає.',
    hidden: 'Пачку сховано',
    cleared: 'Прибрано пачок: {n}',
  },
}

/** The `language` option as installed; anything else falls back to English. */
export const languageOf = (value: unknown): Language => (value === 'ru' ? 'ru' : 'en')

/** Every language's answers header: a transcript may hold messages sent under another setting. */
export const ANSWERS_HEADERS: readonly string[] = Object.values(TEXTS).map(texts => texts.answersHeader)
