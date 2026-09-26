import { DbScriptCallback } from '../types/db-types'

function login(email: string, password: string, callback: DbScriptCallback) {
  // Passwords for migrated users live in Auth0. Legacy users must reset theirs.
  // Preserve the supplied production message until recovery is reviewed.
  callback(
    new WrongUsernameOrPasswordError(
      email,
      TEMPLATE_DATA.production
        ? 'Incorrect email or password. Please try again.\nIf you had an effectivealtruism.org account before August 21, 2024: You may need to reset your password. Use the "Forgot Password" option.'
        : 'Incorrect email or password.'
    )
  )
}
