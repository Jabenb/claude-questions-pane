import type { Batch } from '../types'
import { applyReplies, dropResolved, markSent, reopen, resolveByHand, setDraft } from './batch'
import type { Reply } from './batch'

export type PaneState = { batches: Batch[]; lastBatchNo: number; collapsed: string[] }

/** Where a fork's first snapshot came from: the parent's id prefix and the marker it was cut at. */
export type ForkSource = { sessionId: string; seq: number }

export type Change =
  | { op: 'snapshot'; state: PaneState; from?: ForkSource }
  | { op: 'ask'; batch: Batch }
  | { op: 'draft'; id: string; text: string }
  | { op: 'sent'; only?: string }
  | { op: 'reply'; replies: Reply[] }
  | { op: 'hide'; batchId: string }
  | { op: 'fold'; batchId: string }
  | { op: 'clear' }
  | { op: 'resolve'; id: string }
  | { op: 'reopen'; id: string }

/** One line of a session's file. */
export type Entry = Change & { seq: number; ts: number }

export const EMPTY: PaneState = { batches: [], lastBatchNo: 0, collapsed: [] }

/** A journal this long is rewritten as one snapshot. */
export const COMPACT_AT = 500

/** The changes that leave a row in the chat, each carrying a marker: what a fork's history can point at. */
const LOUD: ReadonlySet<Change['op']> = new Set(['ask', 'sent', 'reply'])

export const applyChange = (state: PaneState, change: Change): PaneState => {
  switch (change.op) {
    case 'snapshot':
      return change.state
    case 'ask':
      return { ...state, batches: [...state.batches.filter(batch => batch.id !== change.batch.id), change.batch], lastBatchNo: Math.max(state.lastBatchNo, Number(change.batch.id) || 0) }
    case 'draft':
      return { ...state, batches: setDraft(state.batches, change.id, change.text) }
    case 'sent':
      return { ...state, batches: markSent(state.batches, change.only) }
    case 'reply':
      return { ...state, batches: applyReplies(state.batches, change.replies).batches }
    case 'hide':
      return { ...state, batches: state.batches.filter(batch => batch.id !== change.batchId), collapsed: state.collapsed.filter(id => id !== change.batchId) }
    case 'fold':
      return { ...state, collapsed: state.collapsed.includes(change.batchId) ? state.collapsed.filter(id => id !== change.batchId) : [...state.collapsed, change.batchId] }
    case 'clear':
      return { ...state, batches: dropResolved(state.batches) }
    case 'resolve':
      return { ...state, batches: resolveByHand(state.batches, change.id) }
    case 'reopen':
      return { ...state, batches: reopen(state.batches, change.id) }
  }
}

export const replay = (entries: readonly Change[]): PaneState => entries.reduce(applyChange, EMPTY)

/** The entries of a file; a line cut short by a crash or edited by hand is skipped. */
export const parseJournal = (text: string): Entry[] =>
  text.split('\n').flatMap(line => {
    try {
      const entry = JSON.parse(line) as Entry

      return typeof entry?.seq === 'number' && typeof entry.op === 'string' ? [entry] : []
    } catch {
      return []
    }
  })

export const serialize = (entry: Entry): string => `${JSON.stringify(entry)}\n`

/** What rides on every row the pane leaves in the chat: whose file and how far it had got. */
export const marker = (sessionId: string, seq: number): string => `‹q:${sessionId.slice(0, 8)}#${seq}›`

/** The newest marker in a history, read oldest first. */
export const lastMarker = (history: string): ForkSource | null => {
  const found = [...history.matchAll(/‹q:([0-9a-zA-Z-]{1,36})#(\d+)›/g)].at(-1)

  return found === undefined ? null : { sessionId: found[1]!, seq: Number(found[2]) }
}

/**
 * The parent's journal as a fork saw it: everything up to the marker its history ends on, then the quiet changes
 * (drafts, hiding, folding, statuses by hand) made before the fork, up to the parent's next loud change.
 * Null when the parent compacted past that marker.
 */
export const cutForFork = (entries: readonly Entry[], seq: number, forkedAt: number): Entry[] | null => {
  if (entries.length === 0 || entries[0]!.seq > seq) {
    return null
  }

  const upTo = entries.filter(entry => entry.seq <= seq)
  const after = entries.filter(entry => entry.seq > seq)
  const firstLoud = after.findIndex(entry => LOUD.has(entry.op) || entry.ts >= forkedAt)

  return [...upTo, ...(firstLoud === -1 ? after : after.slice(0, firstLoud))]
}
