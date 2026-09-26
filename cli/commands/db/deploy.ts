import { red, green } from 'chalk'
import auth0 from '../../lib/client'
import { generateCode, getAllConnections } from '../../lib/utils'
import { DB_MANIFEST, getLoginTenant } from '../../manifests'
import { CONNECTION_NAME } from '../../lib/db-utils'
import { exit } from 'process'

export default async function run() {
  try {
    getLoginTenant()
    const connections = await getAllConnections()
    const dbConnection = connections.find(
      (conn) => conn.name === CONNECTION_NAME
    )
    if (!dbConnection) {
      throw new Error('Could not find requested Auth0 connection')
    }
    if (!dbConnection.id) {
      // Apparently Auth0 doesn't guarantee that a connection has an id??
      throw new Error('Connection is missing ID (this should never happen)')
    }
    const options = dbConnection.options
    const ourCustomScripts = Object.fromEntries(
      await Promise.all(
        DB_MANIFEST.map(async (scriptDef) => [
          scriptDef.name,
          await generateCode(scriptDef, 'db'),
        ])
      )
    )
    // It is crucial that the options object contains the previous options, as
    // the whole options object will be overriden in this update
    const updatedCustomScripts = {
      ...options.customScripts,
      ...ourCustomScripts,
    }
    options.customScripts = updatedCustomScripts
    await auth0.connections.update({ id: dbConnection.id }, { options })
    console.log(`Scripts updated ${green(`\u2713`)}`)
  } catch (err) {
    console.error(red((err as Error).message))
    exit(1)
  }
}
