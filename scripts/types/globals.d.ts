declare global {
  /** We inject this into the top of functions, so it will be present */
  const TEMPLATE_DATA: Record<string, any>

  // --- DB Globals ---
  /** Global error class */
  class WrongUsernameOrPasswordError extends Error {
    constructor(identifier: string, message: string)
    identifier: string
  }
  /** Return this in `login` if user authentication fails. Auth0 provides this as a global. */
  const WrongUsernameOrPasswordError: WrongUsernameOrPasswordError
}

export {}
