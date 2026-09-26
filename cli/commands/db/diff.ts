import { Change, diffLines } from 'diff'
import { DB_MANIFEST, getLoginTenant } from '../../manifests'
import { CONNECTION_NAME } from '../../lib/db-utils'
import { generateCode, getAllConnections, printCodeDiff } from '../../lib/utils'

export default async function run() {
  getLoginTenant()
  // NB: Connection is a term-of-art in Auth0 for an identity provider,
  // including the username/password database
  const connections = await getAllConnections()
  const dbConnection = connections.find((conn) => conn.name === CONNECTION_NAME)
  if (!dbConnection) {
    throw new Error('Could not find requested Auth0 connection')
  }
  const diffs: [DBActionScriptDefinition, Change[]][] = []
  for (const scriptDef of DB_MANIFEST) {
    const ourScript = await generateCode(scriptDef, 'db')
    const existingScript = dbConnection.options.customScripts?.[scriptDef.name]
    if (!existingScript) {
      throw new Error(
        [
          'Could not find specified database action script on connection.',
          'Are you sure you have the correct name of your script, and that the connection supports a custom database?',
          `Script name: ${scriptDef.name}`,
        ].join('\n')
      )
    }
    diffs.push([scriptDef, diffLines(existingScript, ourScript)])
  }
  const upToDateScripts = printCodeDiff(diffs, 'db')
  if (DB_MANIFEST.length === upToDateScripts.length) {
    console.log('Database action scripts are up-to-date')
  }
}
