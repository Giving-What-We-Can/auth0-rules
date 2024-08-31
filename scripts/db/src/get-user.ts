import { Client as PGClient, ConnectionConfig as PGConnectionConfig } from 'pg'
import {
  CallbackUser,
  DbConfiguration,
  DbScriptCallback,
} from '../types/db-types'

// TODO: This is pretty copy-pasta-y from login. We should fix this by building
// good code-sharing functionality into this repo. But notice that we can't just
// naively import and run a function. So we'll need to write code that takes
// function definitions and inserts them into the top of the function. It is my
// (JP's) opinion that we should wait until there's one more instance of code
// re-use before making that refactor.

/**
 * Parfit DB Person, as returned by the written query
 *
 * It is up to the programmer to keep this up to date if the query changes
 */
type PersonResult = {
  id: string
  email: string
  first_name: string
  last_name: string
}

/** Authenticates a user against existing user databases */
async function getByEmail(email: string, callback: DbScriptCallback) {
  // Auth0 comment:
  // This script should retrieve a user profile from your existing database,
  // without authenticating the user.
  // It is used to check if a user exists before executing flows that do not
  // require authentication (signup and password reset).
  //
  // There are three ways this script can finish:
  // 1. A user was successfully found. The profile should be in the following
  // format: https://auth0.com/docs/users/normalized/auth0/normalized-user-profile-schema.
  //     callback(null, profile);
  // 2. A user was not found
  //     callback(null);
  // 3. Something went wrong while trying to reach your database:
  //     callback(new Error("my error message"));
  try {
    /** Get required dependencies */
    const { Client: PGClient } = require('pg@8.7.1')

    /**
     * `configuration` is declared a global by @typez/auth0-rules-types, and
     * there's no way to undo that. We must resort to a hack here to inform
     * typescript of the actual shape of `configuration`
     */
    const {
      POSTGRES_USERNAME,
      POSTGRES_PASSWORD,
      POSTGRES_HOST,
      POSTGRES_DATABASE,
      POSTGRES_PORT,
    } = configuration as unknown as DbConfiguration

    async function getParfitUser(): Promise<CallbackUser | null> {
      /** Declare connection info */
      const pgConnectionInfo: PGConnectionConfig = {
        user: POSTGRES_USERNAME,
        password: POSTGRES_PASSWORD,
        host: POSTGRES_HOST,
        database: POSTGRES_DATABASE,
        port: POSTGRES_PORT ? parseInt(POSTGRES_PORT) : 5432,
        ssl: TEMPLATE_DATA.pgShouldSsl,
      }

      /**
       * NOTE: Temporary fix for Auth0 bug August 2022
       * Should be reverted ASAP
       *
       * Update Nov 2022: Auth0 told me the bug is fixed so I tried
       * reverting and it broke - the bug is very much not fixed :(
       */
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

      /** Construct a postgres client and connect to the server */
      const pgClient: PGClient = new PGClient(pgConnectionInfo)
      await pgClient.connect()

      /** Get the person based on their email */
      const parfitQuery = `
        SELECT
          id, email, first_name, last_name
        FROM people.person
        where person.email = $1
      `
      const Person = await pgClient
        .query<PersonResult>(parfitQuery, [email])
        .then((res) => res.rows[0])

      /** Close the connection */
      await pgClient.end()

      process.env.NODE_TLS_REJECT_UNAUTHORIZED = '1'

      if (!Person) {
        return null
      }
      return {
        id: Person.id,
        given_name: Person.first_name,
        family_name: Person.last_name,
        email: Person.email,
      }
    }

    /** Give priority to Forum users, as the integration is newer and it has more users */
    const parfitUser = await getParfitUser()
    if (parfitUser) {
      return callback(null, parfitUser)
    }
    return callback(null)
  } catch (err) {
    return callback(err as Error)
  }
}
