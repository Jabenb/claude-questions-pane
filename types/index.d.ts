export type Entry = { from: 'user' | 'claude'; text: string }

export type Question = {
  id: string
  n: number
  text: string
  options: string[]
  draft: string
  thread: Entry[]
  status: 'open' | 'sent' | 'resolved'
}

export type Batch = { id: string; title: string; questions: Question[] }

declare module 'claude-code' {
  interface PluginState {
    questions: { batches: Shaped<Batch[]>; lastBatchNo: number; collapsed: string[] }
  }
}
