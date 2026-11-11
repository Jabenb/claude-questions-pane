import type { Hub } from './web'

/** Types `$.webhub` for this plugin's own calls; the noun is there only while the `webhub` mod is loaded. */
declare module 'claude-code' {
  interface EngineInterface {
    webhub: Hub
  }
}
