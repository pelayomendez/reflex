export type Preview = {
  /** The draft this preview was made for: a newer draft makes it stale. */
  text: string
  /** The line above the prompt. */
  line: string
}

export type Recent = {
  /** A file Claude wrote or edited this session, by its absolute path. */
  path: string
  /** When the write went through, in milliseconds since the epoch. */
  at: number
}

declare module 'claude-code' {
  interface PluginState {
    reflex: {
      preview: Preview | null
      recent: Recent[]
    }
  }
}
