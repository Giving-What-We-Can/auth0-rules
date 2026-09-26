import { DbScriptCallback } from '../types/db-types'

function login(email: string, password: string, callback: DbScriptCallback) {
  // Migrated users authenticate in Auth0; legacy passwords are not accepted here.
  callback(
    new WrongUsernameOrPasswordError(
      email,
      'Incorrect email or password. Try again or use "Forgot Password" to reset your password.'
    )
  )
}
