import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Batch, Question } from '../types'
import { languageOf, TEXTS } from './i18n'
import type { Language, Texts } from './i18n'
import { applyReplies, awaitingReply, composeAnswers, dropResolved, markSent, parseAsk, parseReplies, pending, rebuild, reopen, replyFooter, resolveByHand, replyReminder, setDraft } from './batch'

const PANE = 'questions'
const COMMAND = 'questions'
const ASK = 'mcp__questions__ask'
const REPLY = 'mcp__questions__reply'

const batches = atom({ plugin: 'questions', key: 'batches' } as const, [], { shape: 'batches-1' })
/** Only grows: a hidden batch's number is never given again, so its ids in the chat history stay its own. */
const lastBatchNo = atom({ plugin: 'questions', key: 'lastBatchNo' } as const, 0)
/** Ids of the batches folded down to their header. */
const collapsed = atom({ plugin: 'questions', key: 'collapsed' } as const, [])

const GUIDE = [
  '# Questions pane',
  `When you need the user to decide more than two things (implementation questions, open points of a feature, clarifications), do not write them as a numbered list in chat: call ${ASK} with all of them, each with its options when there are obvious ones, then end your turn with one short line saying the questions are in the pane. Keep each question self-contained: it is read alone, next to its own answer field.`,
  `The user's answers arrive as one message where every answer sits under its question, tagged with its id like [1.3]. Reply to every answered id with ${REPLY} before the turn ends, not only the ones you discuss in chat: a question stays unresolved in the pane until it gets your reply. resolved: true only when the answer is a final decision; resolved: false when the user leaves the point open or undecided, or when your reply asks the user something back. In chat, never refer to a question by its bare number: open each point with the question's short title and quote the user's answer, e.g. "**Q3 · Where to keep the lead** — you: «in our DB» → …".`,
].join('\n\n')

const openPane = ($: EngineInterface, texts: Texts, isFocused = false): Promise<unknown> =>
  $.ui.open(isFocused ? { id: PANE, title: texts.paneTitle, focus: true } : { id: PANE, title: texts.paneTitle })

/** What is typed stays out of state until the field loses focus: a state write per key redraws the pane under the cursor. */
const typing = new Map<string, string>()

const commit = async ($: EngineInterface): Promise<void> => {
  const typed = [...typing]

  if (typed.length === 0) {
    return
  }

  await update($, batches, current => typed.reduce((acc, [id, draft]) => setDraft(acc, id, draft), current))
  typed.forEach(([id, draft]) => typing.get(id) === draft && typing.delete(id))
}

const hide = async ($: EngineInterface, batchId: string): Promise<void> => {
  const list = await read($, batches)
  list.find(batch => batch.id === batchId)?.questions.forEach(question => typing.delete(question.id))
  await update($, batches, current => current.filter(batch => batch.id !== batchId))
}

const pick = async ($: EngineInterface, question: Question, option: string): Promise<void> => {
  typing.delete(question.id)
  await commit($)
  await update($, batches, current => setDraft(current, question.id, question.draft === option ? '' : option))
}

const send = async ($: EngineInterface, language: Language, only?: string): Promise<void> => {
  await commit($)
  const list = await read($, batches)
  const text = composeAnswers(list, only, language)

  if (text === '') {
    $.ui.toast(TEXTS[language].nothingToSend, { timeoutMs: 3000 })

    return
  }

  const sent = await update($, batches, current => markSent(current, only))
  await $.prompt.submit({ text: `${text}\n\n${replyFooter(awaitingReply(sent), language)}`, asUser: true })
}

const fold = async ($: EngineInterface, batchId: string): Promise<void> => {
  await commit($)
  await update($, collapsed, current => (current.includes(batchId) ? current.filter(id => id !== batchId) : [...current, batchId]))
}

/** A fork or a resume starts with an empty state: the pane is told again from the transcript. */
const restore = async ($: EngineInterface): Promise<void> => {
  if ((await read($, batches)).length > 0 || (await read($, lastBatchNo)) > 0) {
    return
  }

  const told = rebuild(await $.session.messages())

  if (told.batches.length > 0) {
    await update($, batches, () => told.batches)
    await update($, lastBatchNo, () => told.lastBatchNo)
  }
}

type Look = { mark: string; color: string; hint: string }

const lookOf = (question: Question, texts: Texts): Look => {
  if (question.status === 'resolved') {
    return { mark: '✓', color: 'success', hint: texts.hintResolved }
  }

  if (question.status === 'sent') {
    return { mark: '…', color: 'warning', hint: texts.hintWaiting }
  }

  return question.draft.trim() !== ''
    ? { mark: '●', color: 'suggestion', hint: texts.hintAnswered }
    : { mark: '○', color: 'subtle', hint: texts.hintEmpty }
}

export const register: Register = (on, options) => {
  const language = languageOf(options.language)
  const texts = TEXTS[language]

  on('session.start', async ($, e, next) => {
    const result = await next(e)
    await $.command.register({ name: COMMAND, description: 'Open the questions pane' })
    await $.tool.register({
      name: 'ask',
      description: 'Show a batch of questions for the user in the Questions pane, each with its own answer field. Use instead of a numbered list in chat whenever you have more than two questions.',
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
      description: 'Attach your reply under answered questions in the Questions pane, by question id like "1.3". Every answered id needs one entry: a question without your reply never shows as resolved.',
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
              },
              required: ['id', 'text'],
            },
          },
        },
        required: ['replies'],
      },
    })

    await restore($)

    if ((await read($, batches)).some(batch => batch.questions.some(question => question.status !== 'resolved'))) {
      void openPane($, texts)
    }

    return result
  })

  on('prompt.compose', async ($, e, next) => {
    const composed = await next(e)

    return { sections: [...composed.sections, { id: 'questions:guide', text: GUIDE, scope: 'session' }] }
  })

  /** Rides on every later prompt while answers wait; the pane's own send says it in its text (see `replyFooter`). */
  on('prompt.submit', async ($, e, next) => {
    const ids = e.command === undefined ? awaitingReply(await read($, batches)) : []

    return next(ids.length === 0 ? e : { ...e, context: [...(e.context ?? []), replyReminder(ids)] })
  })

  on('command.run', { command: COMMAND }, async $ => {
    await openPane($, texts)

    return { text: texts.opened }
  })

  on('tool.call', { tool: ASK }, async ($, e) => {
    const list = await read($, batches)
    const batchNo = list.reduce((max, batch) => Math.max(max, Number(batch.id) || 0), await read($, lastBatchNo)) + 1
    const batch = parseAsk(e as unknown as Record<string, unknown>, batchNo, language)

    if (batch === null) {
      return { deny: 'No questions given: pass questions as [{ text, options? }].' }
    }

    await update($, batches, current => [...current, batch])
    await update($, lastBatchNo, last => Math.max(last, batchNo))
    void openPane($, texts, true)

    return {
      result: `${batch.questions.length} questions are shown in the Questions pane (ids ${batch.questions.map(q => q.id).join(', ')}). End your turn now and wait: the answers arrive as one message.`,
    }
  })

  on('tool.call', { tool: REPLY }, async ($, e) => {
    const replies = parseReplies(e as unknown as Record<string, unknown>)
    let unknown: string[] = []
    const updated = await update($, batches, current => {
      const applied = applyReplies(current, replies)
      unknown = applied.unknown

      return applied.batches
    })
    const waiting = awaitingReply(updated)
    const shown = unknown.length === 0 ? `${replies.length} replies shown in the pane.` : `Shown; no question with ids ${unknown.join(', ')}.`

    return { result: waiting.length === 0 ? shown : `${shown} Still without your reply: ${waiting.join(', ')} — reply to each of them too.` }
  })

  on('ui.focus', { requestId: PANE }, async ($, e, next) => {
    const moved = await next(e)
    await commit($)

    return moved
  })

  on('ui.render', { component: 'SessionMode' }, async ($, e, next) => {
    const below = await next(e)
    const { Box, Button } = $.ui.resolve(e)

    return (
      <Box flexDirection="row" alignItems="center" columnGap="sm">
        {below}
        <Button
          key="questions"
          plain
          label="❓"
          onPress={() => void openPane($, texts, true)}
        />
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const list: Batch[] = await read($, batches)
    const folded = await read($, collapsed)
    const ui = $.ui.resolve(e)
    const { Box, Text, Button } = ui
    const Input = e.surface === 'mobile' || !('Input' in ui) ? null : ui.Input
    const all = list.flatMap(batch => batch.questions)
    const waiting = pending(list).length
    const resolved = all.filter(question => question.status === 'resolved').length

    if (list.length === 0) {
      return (
        <Box flexDirection="column" padding="md" rowGap="sm">
          <Text size="heading" weight="semibold">{texts.emptyTitle}</Text>
          <Text dimColor>{texts.emptyHint}</Text>
        </Box>
      )
    }

    return (
      <Box flexDirection="column" paddingX="sm" paddingY="sm" rowGap="lg">
        {list.map(batch => {
          const isFolded = folded.includes(batch.id)
          const batchWaiting = pending([batch]).length

          return (
          <Box key={`b-${batch.id}`} flexDirection="column" rowGap="md">
            <Box flexDirection="column" rowGap="xs">
              <Box flexDirection="row" justifyContent="space-between" alignItems="center" columnGap="sm">
                <Box flexDirection="row" alignItems="center" columnGap="xs">
                  <Button key={`fold-${batch.id}`} plain label={isFolded ? '▸' : '▾'} onPress={() => void fold($, batch.id)} />
                  <Text size="heading" weight="semibold">{batch.title}</Text>
                </Box>
                <Box flexDirection="row" columnGap="sm">
                  {batchWaiting > 0 && (
                    <Button key={`send-${batch.id}`} variant="primary" label={texts.sendBatch(batchWaiting)} onPress={() => void send($, language, batch.id)} />
                  )}
                  <Button key={`hide-${batch.id}`} variant="secondary" dimColor label={texts.hide} onPress={() => void hide($, batch.id)} />
                </Box>
              </Box>
              <Text size="footnote" dimColor>
                {texts.stats(
                  batch.questions.length,
                  batch.questions.filter(question => question.status !== 'open' || question.draft.trim() !== '').length,
                  batch.questions.filter(question => question.status === 'resolved').length,
                )}
              </Text>
            </Box>
            {!isFolded && batch.questions.map(question => {
              const look = lookOf(question, texts)
              const isOpen = question.status === 'open'

              return (
                <Box
                  key={`q-${question.id}`}
                  flexDirection="column"
                  rowGap="sm"
                  padding="md"
                  borderStyle="round"
                  borderColor={look.color}
                  borderDimColor={question.status === 'resolved'}
                >
                  <Box flexDirection="row" justifyContent="space-between" columnGap="sm">
                    <Text size="footnote" weight="semibold" color={look.color}>{`${look.mark} Q${question.n}`}</Text>
                    {question.status === 'resolved' ? (
                      <Button key={`reopen-${question.id}`} plain dimColor label={texts.reopen} onPress={() => void update($, batches, current => reopen(current, question.id))} />
                    ) : isOpen && question.thread.length > 0 ? (
                      <Button
                        key={`resolve-${question.id}`}
                        plain
                        dimColor
                        label={texts.resolveByHand}
                        onPress={() => {
                          typing.delete(question.id)
                          void update($, batches, current => resolveByHand(current, question.id))
                        }}
                      />
                    ) : (
                      <Text size="footnote" dimColor>{look.hint}</Text>
                    )}
                  </Box>
                  <Text weight={isOpen ? 'medium' : 'regular'} dimColor={question.status === 'resolved'}>{question.text}</Text>
                  {question.thread.length > 0 && (
                    <Box flexDirection="column" rowGap="xs" paddingLeft="sm">
                      {question.thread.map(entry => (
                        <Text size="footnote" color={entry.from === 'claude' ? 'claude' : 'text'}>
                          {`${entry.from === 'user' ? texts.you : 'Claude'}: ${entry.text}`}
                        </Text>
                      ))}
                    </Box>
                  )}
                  {isOpen && question.options.length > 0 && (
                    <Box flexDirection="row" flexWrap="wrap" columnGap="xs" rowGap="xs">
                      {question.options.map((option, index) => (
                        <Button
                          key={`o-${question.id}-${index}`}
                          variant={question.draft === option ? 'primary' : 'secondary'}
                          label={question.draft === option ? `✓ ${option}` : option}
                          onPress={() => void pick($, question, option)}
                        />
                      ))}
                    </Box>
                  )}
                  {isOpen && Input !== null && (
                    <Input
                      key={`a-${question.id}`}
                      placeholder={question.options.length > 0 ? texts.ownAnswer : texts.answer}
                      value={typing.get(question.id) ?? question.draft}
                      rows={2}
                      submitLabel="↵"
                      onInput={value => void typing.set(question.id, value)}
                      onSubmit={value => {
                        typing.set(question.id, value)
                        void commit($)
                      }}
                    />
                  )}
                </Box>
              )
            })}
          </Box>
          )
        })}
        {Input === null && <Text size="footnote" dimColor>{texts.noInput}</Text>}
        <Box flexDirection="row" alignItems="center" justifyContent="space-between" columnGap="sm" paddingTop="sm">
          <Text size="footnote" dimColor>{texts.footer(waiting, resolved, all.length)}</Text>
          <Box flexDirection="row" columnGap="sm">
            {resolved > 0 && <Button key="clear" variant="secondary" dimColor label={texts.clearResolved} onPress={() => void update($, batches, dropResolved)} />}
            <Button key="send" variant="primary" dimColor={waiting === 0} label={texts.sendAll(waiting)} onPress={() => void send($, language)} />
          </Box>
        </Box>
      </Box>
    )
  })
}
