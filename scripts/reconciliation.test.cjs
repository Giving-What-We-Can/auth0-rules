const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { test } = require('node:test')

// Never load .env or initialize a real tenant client in these offline tests.
Object.assign(process.env, {
  AUTH0_DOMAIN: 'offline-test.invalid',
  AUTH0_CLIENT_ID: 'offline-test',
  AUTH0_CLIENT_SECRET: 'offline-test',
})
delete process.env.TOKEN_NAMESPACE
const manifests = require('../dist/manifests')
const utils = require('../dist/lib/utils')
utils.getAllClients = async () => [
  { name: 'Giving What We Can', client_id: 'gwwc-dev' },
]

function selectTenant(environment) {
  process.env.AUTH0_DOMAIN =
    environment === 'production'
      ? 'giving-what-we-can.us.auth0.com'
      : 'giving-what-we-can-dev.us.auth0.com'
  delete process.env.TOKEN_NAMESPACE
}

function loadCommand(command, client, utilityOverrides = {}) {
  const messages = []
  const exports = {}
  vm.runInNewContext(
    readFileSync(
      path.join(__dirname, '../dist/commands', command + '.js'),
      'utf8'
    ),
    {
      exports,
      process: {
        env: {
          AUTH0_DOMAIN: 'offline-test.invalid',
          AUTH0_CLIENT_ID: 'dummy',
          AUTH0_CLIENT_SECRET: 'dummy',
        },
      },
      console: {
        log: (...values) => messages.push(values.join(' ')),
        error: (...values) => messages.push(values.join(' ')),
      },
      setTimeout: (callback) => callback(),
      require: (name) => {
        if (name === '../../lib/client') return client
        if (name === '../../lib/utils')
          return { ...utils, printCodeDiff: () => [], ...utilityOverrides }
        if (name === '../../manifests') return manifests
        if (name === '../../lib/db-utils')
          return require('../dist/lib/db-utils')
        if (name === 'chalk') return require('chalk')
        if (name === 'diff') return require('diff')
        if (name === 'process')
          return {
            exit: (code) => {
              throw new Error(`exit ${code}`)
            },
          }
        throw new Error(`Unexpected dependency: ${name}`)
      },
    }
  )
  return { run: exports.default, messages }
}

function actionFixture({
  failDeployment = false,
  missingDisabled = false,
} = {}) {
  const names = [
    'Add email to access token',
    'Manage scopes',
    'Add Default Role To All Users',
    'Expire passwords',
    'Log Context',
    'Unmanaged Action',
  ]
  const actions = names
    .filter(
      (name) =>
        !missingDisabled ||
        name === 'Add email to access token' ||
        name === 'Unmanaged Action'
    )
    .map((name) => ({
      id: name,
      name,
      code: `stored ${name}`,
    }))
  let bindings = actions.map((action) => ({
    display_name: action.name,
    action,
  }))
  const updated = []
  const deployed = []
  const bindingChanges = []
  return {
    client: {
      actions: {
        update: async ({ id }, payload) => updated.push({ id, payload }),
        create: async () => {
          throw new Error('No Action should be created')
        },
        deploy: async ({ id }) => {
          deployed.push(id)
          if (failDeployment === true || failDeployment === id)
            throw new Error('Build failed')
        },
        getTriggerBindings: async ({ page }) => ({
          status: 200,
          data: { bindings: page === 0 ? bindings : [] },
        }),
        updateTriggerBindings: async (parameters, payload) => {
          bindings = Array.from(payload.bindings, (binding) => ({
            display_name: binding.display_name,
            action: actions.find((action) => action.id === binding.ref.value),
          }))
          bindingChanges.push(bindings.map((binding) => binding.action.name))
        },
      },
    },
    overrides: { getAllActions: async () => actions },
    updated,
    deployed,
    bindingChanges,
    boundNames: () => bindings.map((binding) => binding.action.name),
  }
}

test('production deploy only updates email, unbinds retired Actions, and preserves unmanaged bindings', async () => {
  selectTenant('production')
  const fixture = actionFixture()
  await loadCommand('actions/deploy', fixture.client, fixture.overrides).run()
  assert.deepEqual(
    fixture.updated.map(({ id }) => id),
    ['Add email to access token']
  )
  assert.deepEqual(fixture.deployed, ['Add email to access token'])
  assert.deepEqual(fixture.boundNames(), [
    'Add email to access token',
    'Unmanaged Action',
  ])
  assert.match(
    fixture.updated[0].payload.code,
    /namespace: "https:\/\/parfit.givingwhatwecan.org"/
  )
})

test('dev deploy replaces scopes before removing roles and retains email/scopes order', async () => {
  selectTenant('development')
  const fixture = actionFixture()
  await loadCommand('actions/deploy', fixture.client, fixture.overrides).run()
  assert.deepEqual(
    fixture.updated.map(({ id }) => id),
    ['Add email to access token', 'Manage scopes']
  )
  assert.deepEqual(fixture.boundNames(), [
    'Add email to access token',
    'Manage scopes',
    'Unmanaged Action',
  ])
  assert.ok(fixture.bindingChanges[1].includes('Add Default Role To All Users'))
  assert.match(
    fixture.updated[1].payload.code,
    /namespace: "https:\/\/parfit.givingwhatwecan.org\/"/
  )
})

test('failed deployment exits without reporting success or changing bindings', async () => {
  selectTenant('production')
  const fixture = actionFixture({ failDeployment: true })
  const command = loadCommand(
    'actions/deploy',
    fixture.client,
    fixture.overrides
  )
  await assert.rejects(command.run(), /exit 1/)
  assert.equal(fixture.deployed.length, 5)
  assert.equal(fixture.bindingChanges.length, 0)
  assert.ok(
    !command.messages.some((message) =>
      message.includes('New version deployed')
    )
  )
})

test('unknown tenant and incompatible namespace are rejected before fetching Actions', async () => {
  const fixture = actionFixture()
  let reads = 0
  const command = loadCommand('actions/deploy', fixture.client, {
    getAllActions: async () => {
      reads++
      return []
    },
  })
  process.env.AUTH0_DOMAIN = 'unreviewed-staging.us.auth0.com'
  await assert.rejects(command.run(), /exit 1/)
  selectTenant('production')
  process.env.TOKEN_NAMESPACE = 'https://parfit.givingwhatwecan.org/'
  await assert.rejects(command.run(), /exit 1/)
  assert.equal(reads, 0)
  delete process.env.TOKEN_NAMESPACE
})

test('Rules deploy only disables existing retired Rules and preserves account linking', async () => {
  selectTenant('production')
  const updates = []
  const client = {
    rules: {
      update: async (parameters, payload) =>
        updates.push({ parameters, payload }),
      create: async () => {
        throw new Error('Retired Rules must not be recreated')
      },
    },
  }
  const command = loadCommand('rules/deploy', client, {
    getAllRules: async () => [
      {
        id: 'account-link',
        name: 'auth0-account-link-extension',
        enabled: true,
        order: 1,
      },
      {
        id: 'old-email',
        name: 'Add email to access token',
        enabled: true,
        order: 2,
      },
    ],
  })
  await command.run()
  assert.equal(updates.length, 1)
  assert.equal(updates[0].parameters.id, 'old-email')
  assert.equal(updates[0].payload.enabled, false)
  assert.deepEqual(Object.keys(updates[0].payload), ['enabled'])
})

test('diff shows binding changes even when disabled Action code is not generated', async () => {
  selectTenant('production')
  const fixture = actionFixture()
  const command = loadCommand('actions/diff', fixture.client, fixture.overrides)
  await command.run()
  assert.ok(
    command.messages.some((message) =>
      message.includes('Expire passwords: bound -> unbound')
    )
  )
  assert.ok(
    command.messages.some((message) =>
      message.includes('Manage scopes: bound -> unbound')
    )
  )
  assert.equal(fixture.updated.length, 0)
  assert.equal(fixture.bindingChanges.length, 0)
})

test('custom Login rejects legacy passwords with generic recovery guidance', async () => {
  selectTenant('production')
  const code = await utils.generateCode(
    manifests.DB_MANIFEST.find((definition) => definition.name === 'login'),
    'db'
  )
  let returnedError
  const context = vm.createContext({
    WrongUsernameOrPasswordError: class extends Error {
      constructor(identifier, message) {
        super(message)
        this.identifier = identifier
      }
    },
    callback: (error) => {
      returnedError = error
    },
  })
  vm.runInContext(
    code + '\nlogin("test@example.invalid", "unused", callback)',
    context
  )
  assert.equal(returnedError.identifier, 'test@example.invalid')
  assert.equal(
    returnedError.message,
    'Incorrect email or password. Try again or use "Forgot Password" to reset your password.'
  )
})

test('missing disabled Actions are not created', async () => {
  selectTenant('production')
  const fixture = actionFixture({ missingDisabled: true })
  await loadCommand('actions/deploy', fixture.client, fixture.overrides).run()
  assert.deepEqual(
    fixture.updated.map(({ id }) => id),
    ['Add email to access token']
  )
  assert.deepEqual(fixture.boundNames(), [
    'Add email to access token',
    'Unmanaged Action',
  ])
})

test('a failed dev scope deployment leaves role assignment bound', async () => {
  selectTenant('development')
  const fixture = actionFixture({ failDeployment: 'Manage scopes' })
  const command = loadCommand(
    'actions/deploy',
    fixture.client,
    fixture.overrides
  )
  await assert.rejects(command.run(), /exit 1/)
  assert.ok(fixture.boundNames().includes('Add Default Role To All Users'))
  assert.equal(fixture.bindingChanges.length, 1)
})

test('database commands reject unknown tenants before reading connections', async () => {
  process.env.AUTH0_DOMAIN = 'unreviewed-staging.us.auth0.com'
  let reads = 0
  const overrides = {
    getAllConnections: async () => {
      reads++
      return []
    },
  }
  await assert.rejects(
    loadCommand('db/diff', {}, overrides).run(),
    /No reviewed login configuration/
  )
  await assert.rejects(loadCommand('db/deploy', {}, overrides).run(), /exit 1/)
  assert.equal(reads, 0)
})
