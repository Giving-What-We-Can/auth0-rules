import type { SupportedActionTrigger } from '../lib/utils'

export {}

declare global {
  interface ActionBindingDefinition {
    /** Exact name in the Auth0 library. */
    name: string
    trigger: SupportedActionTrigger
  }

  /** Disabled entries manage bindings only, preserving stored rollback versions. */
  type ActionDefinition = ActionBindingDefinition &
    (
      | { enabled: false }
      | {
          enabled: true
          file: string
          triggerVersion: string
          getData?: () =>
            | Record<string, unknown>
            | Promise<Record<string, unknown>>
        }
    )
}
