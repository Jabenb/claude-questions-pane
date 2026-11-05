import type { Batch, Question } from '../types'
import { ANSWERS_HEADERS, TEXTS } from './i18n'
import type { Language, Texts } from './i18n'

export type Reply = { id: string; text: string; isResolved: boolean; options: string[] }

const texts = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((one): one is string => typeof one === 'string' && one.trim() !== '').map(one => one.trim()) : []

/** A batch from the `ask` tool input; null when it holds no question. */
export const parseAsk = (input: Record<string, unknown>, batchNo: number, language: Language = 'en'): Batch | null => {
  const raw = Array.isArray(input.questions) ? input.questions : []
  const questions: Question[] = []

  for (const item of raw) {
    const text = typeof item === 'string' ? item : typeof item?.text === 'string' ? item.text : ''

    if (text.trim() === '') {
      continue
    }

    const n = questions.length + 1
    questions.push({ id: `${batchNo}.${n}`, n, text: text.trim(), options: texts(item?.options), draft: '', thread: [], status: 'open' })
  }

  if (questions.length === 0) {
    return null
  }

  const title = typeof input.title === 'string' && input.title.trim() !== '' ? input.title.trim() : TEXTS[language].defaultBatchTitle(batchNo)

  return { id: String(batchNo), title, questions }
}

export const parseReplies = (input: Record<string, unknown>): Reply[] =>
  (Array.isArray(input.replies) ? input.replies : [])
    .filter(item => typeof item?.id === 'string' && typeof item?.text === 'string' && item.text.trim() !== '')
    .map(item => ({ id: String(item.id).trim(), text: String(item.text).trim(), isResolved: item.resolved !== false, options: texts(item.options) }))

/** Claude's replies go under their questions; an unresolved one is open again for the next answer, with the options of Claude's follow-up in place of the old ones. */
export const applyReplies = (batches: Batch[], replies: Reply[]): { batches: Batch[]; unknown: string[] } => {
  const byId = new Map(replies.map(reply => [reply.id, reply]))
  const seen = new Set<string>()
  const next = batches.map(batch => ({
    ...batch,
    questions: batch.questions.map(question => {
      const reply = byId.get(question.id)

      if (reply === undefined) {
        return question
      }

      seen.add(question.id)

      return {
        ...question,
        thread: [...question.thread, { from: 'claude' as const, text: reply.text }],
        status: reply.isResolved ? ('resolved' as const) : ('open' as const),
        options: reply.isResolved ? question.options : reply.options,
      }
    }),
  }))

  return { batches: next, unknown: replies.map(reply => reply.id).filter(id => !seen.has(id)) }
}

/** Ids the user answered that still have no reply from Claude. */
export const awaitingReply = (batches: Batch[]): string[] =>
  batches.flatMap(batch => batch.questions).filter(question => question.status === 'sent').map(question => question.id)

export const replyReminder = (ids: string[]): string =>
  `Questions pane: the user answered ${ids.join(', ')} and each still waits for your reply. Before this turn ends, call mcp__questions__reply with one entry for EVERY one of these ids, not only the ones you discuss in chat. resolved: true only when the answer is a final decision; resolved: false when the user leaves the point open or undecided ("still open", "later", a question back) or when your reply asks the user something back; then give options for your follow-up when it has obvious answers.`

/** Closes the pane's own message: a plugin's own submit skips its `prompt.submit` hook, so the reminder is said in the text. */
export const replyFooter = (ids: string[], language: Language = 'en'): string => TEXTS[language].replyFooter(ids.join(', '))

export const pending = (batches: Batch[]): Question[] =>
  batches.flatMap(batch => batch.questions).filter(question => question.status === 'open' && question.draft.trim() !== '')

/** The message the pane sends: every answer under the question it answers. */
export const composeAnswers = (batches: Batch[], only?: string, language: Language = 'en'): string => {
  const parts: string[] = []

  for (const batch of batches.filter(one => only === undefined || one.id === only)) {
    const answered = batch.questions.filter(question => question.status === 'open' && question.draft.trim() !== '')

    if (answered.length === 0) {
      continue
    }

    parts.push(`${TEXTS[language].answersHeader}${batch.title}»:`)

    for (const question of answered) {
      parts.push(`**[${question.id}] Q${question.n}. ${question.text}**\n→ ${question.draft.trim()}`)
    }
  }

  return parts.join('\n\n')
}

const answered = (question: Question, text: string): Question =>
  ({ ...question, thread: [...question.thread, { from: 'user' as const, text }], draft: '', status: 'sent' as const })

/** Answers leave the drafts for the thread and wait for Claude's reply; `only` keeps the other batches' drafts as they are. */
export const markSent = (batches: Batch[], only?: string): Batch[] =>
  batches.map(batch =>
    only !== undefined && batch.id !== only
      ? batch
      : {
          ...batch,
          questions: batch.questions.map(question =>
            question.status === 'open' && question.draft.trim() !== '' ? answered(question, question.draft.trim()) : question,
          ),
        },
  )

/** The user closes a discussed question by hand, an accidental reopen included; a typed draft is dropped. */
export const resolveByHand = (batches: Batch[], id: string): Batch[] =>
  batches.map(batch => ({
    ...batch,
    questions: batch.questions.map(question => (question.id === id && question.status === 'open' ? { ...question, draft: '', status: 'resolved' as const } : question)),
  }))

/** A resolved question takes a new answer again; its thread stays. */
export const reopen = (batches: Batch[], id: string): Batch[] =>
  batches.map(batch => ({
    ...batch,
    questions: batch.questions.map(question => (question.id === id && question.status === 'resolved' ? { ...question, status: 'open' as const } : question)),
  }))

export const setDraft = (batches: Batch[], id: string, draft: string): Batch[] =>
  batches.map(batch => ({
    ...batch,
    questions: batch.questions.map(question => (question.id === id ? { ...question, draft } : question)),
  }))

/** A question as plain text for the clipboard: the whole thread, the options still offered and an unsent draft. */
export const questionText = (question: Question, texts: Texts): string => {
  const lines = [`[${question.id}] Q${question.n}. ${question.text}`, ...question.thread.map(entry => `${entry.from === 'user' ? texts.you : 'Claude'}: ${entry.text}`)]

  if (question.status === 'open' && question.options.length > 0) {
    lines.push(`${texts.optionsLabel}: ${question.options.join(' / ')}`)
  }

  if (question.draft.trim() !== '') {
    lines.push(`${texts.draftLabel}: ${question.draft.trim()}`)
  }

  return lines.join('\n')
}

/** A batch, or only one of its questions, under the batch's title. */
export const batchText = (batch: Batch, texts: Texts, questionId?: string): string =>
  [`«${batch.title}»`, ...batch.questions.filter(question => questionId === undefined || question.id === questionId).map(question => questionText(question, texts))].join('\n\n')

export const dropResolved = (batches: Batch[]): Batch[] =>
  batches.filter(batch => batch.questions.some(question => question.status !== 'resolved'))

const escaped = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const NEXT_ANSWER = new RegExp(
  `\\*\\*\\[(\\d+\\.\\d+)\\][^\\n]*\\*\\*\\n→ ([\\s\\S]*?)(?=\\n\\n\\*\\*\\[|${ANSWERS_HEADERS.map(header => `\\n\\n${escaped(header)}`).join('|')}|\\n\\n_Claude:|$)`,
  'g',
)

/** The answers of a pane message by id; an answer runs to the next question, the next batch, the reply footer or the end. */
export const parseAnswers = (text: string): Map<string, string> => {
  const found = new Map<string, string>()
  for (const match of text.matchAll(NEXT_ANSWER)) {
    found.set(match[1]!, match[2]!.trim())
  }

  return found
}

export type TranscriptToolUse = { tool: string; input: Record<string, unknown>; text?: string; result?: unknown; isError?: true }
export type TranscriptMessage = { role: 'user' | 'assistant'; text: string; toolUses: readonly TranscriptToolUse[] }

/** The pane as the transcript tells it: asks, the answers sent from the pane and the replies, in order. */
export const rebuild = (messages: readonly TranscriptMessage[]): { batches: Batch[]; lastBatchNo: number } => {
  let batches: Batch[] = []
  let lastBatchNo = 0

  for (const message of messages) {
    if (message.role === 'user' && ANSWERS_HEADERS.some(header => message.text.startsWith(header))) {
      const answers = parseAnswers(message.text)
      batches = batches.map(batch => ({
        ...batch,
        questions: batch.questions.map(question => (answers.has(question.id) ? answered(question, answers.get(question.id)!) : question)),
      }))
    }

    for (const use of message.toolUses) {
      if (use.isError === true) {
        continue
      }

      if (use.tool === 'mcp__questions__ask') {
        const shown = /ids (\d+)\./.exec(use.text ?? (typeof use.result === 'string' ? use.result : ''))
        const batch = parseAsk(use.input, shown === null ? lastBatchNo + 1 : Number(shown[1]))

        if (batch !== null) {
          batches = [...batches.filter(one => one.id !== batch.id), batch]
          lastBatchNo = Math.max(lastBatchNo, Number(batch.id))
        }
      }

      if (use.tool === 'mcp__questions__reply') {
        batches = applyReplies(batches, parseReplies(use.input)).batches
      }
    }
  }

  return { batches, lastBatchNo }
}
