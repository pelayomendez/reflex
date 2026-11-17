export type Preview = {
  /** The draft this preview was made for: a newer draft makes it stale. */
  text: string
  /** The line above the prompt. */
  line: string
}

export type Recent = {
  /** A file Claude wrote, edited, opened or made with a command this session, by its absolute path; or, instead of `path`, ... */
  path: string
  /** When it was recorded, in milliseconds since the epoch. */
  at: number
} | {
  /** ... a web address Claude opened, ran a command on or showed in its reply: http or https, no credentials, no token in it. */
  url: string
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
