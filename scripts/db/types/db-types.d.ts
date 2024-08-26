/**
 * Shape of user object that Database Action Scripts expect to be returned.
 *
 * There is no predefined type for this, we are using this documentation as
 * a guide for what is allowed:
 * https://auth0.com/docs/manage-users/user-accounts/user-profiles/normalized-user-profile-schema
 */
export interface CallbackUser {
  /**
   * This appears to be necessary, despite no documentation I could find in a
   * cursory inspection
   */
  id: string
  email: string
  email_verified?: boolean
  nickname?: string
  given_name?: string
  family_name?: string
  picture?: string
}
/** Signature of Database Action Script callback */
export type DbScriptCallback = (
  error: Error | null | WrongUsernameOrPasswordError,
  person?: CallbackUser
) => any

/** Configuration available from connection environment variables */
export interface DbConfiguration {
  POSTGRES_USERNAME: string
  POSTGRES_PASSWORD: string
  POSTGRES_HOST: string
  POSTGRES_DATABASE: string
  POSTGRES_PORT?: string
}
