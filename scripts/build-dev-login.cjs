// Generate the reviewed dev Action without contacting Auth0 or loading .env.
// The existing generator imports the ManagementClient, so give it dummy values.
Object.assign(process.env, {
  AUTH0_DOMAIN: 'offline-build.invalid',
  AUTH0_CLIENT_ID: 'offline-build',
  AUTH0_CLIENT_SECRET: 'offline-build',
})

const { mkdir, writeFile } = require('node:fs/promises')
const path = require('node:path')
const { generateCode } = require('../dist/lib/utils')

async function main() {
  // Public identifiers supplied from giving-what-we-can-dev on 2026-09-26.
  const clientId = '0UXcKzf6y5O3RNdQC7KlUzkLiokPu1y2'
  const code = await generateCode(
    {
      name: 'Manage scopes',
      file: 'manage-scopes',
      enabled: true,
      getData: () => ({
        apiScopeApplications: [clientId],
        addScopesToIdTokenApplications: [clientId],
        namespace: 'https://parfit.givingwhatwecan.org/',
      }),
    },
    'actions'
  )
  const outputDirectory = path.join(__dirname, '../dist/dev-login')
  await mkdir(outputDirectory, { recursive: true })
  await writeFile(path.join(outputDirectory, 'manage-scopes.js'), code)
  console.log('Generated dist/dev-login/manage-scopes.js for dev review only.')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
