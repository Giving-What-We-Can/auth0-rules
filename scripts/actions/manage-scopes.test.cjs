const assert = require('node:assert/strict')
const { before, test } = require('node:test')
const vm = require('node:vm')

// Initialize the generator with dummy credentials; never load .env or call Auth0.
Object.assign(process.env, {
  AUTH0_DOMAIN: 'offline-test.invalid',
  AUTH0_CLIENT_ID: 'offline-test',
  AUTH0_CLIENT_SECRET: 'offline-test',
})
delete process.env.TOKEN_NAMESPACE
const utils = require('../../dist/lib/utils')
const { getActionManifest, RULE_MANIFEST } = require('../../dist/manifests')
const clientId = 'test-gwwc-client'
utils.getAllClients = async () => [
  { name: 'Giving What We Can', client_id: clientId },
]
process.env.AUTH0_DOMAIN = 'giving-what-we-can-dev.us.auth0.com'
const actionManifest = getActionManifest()
let code
before(async () => {
  code = await utils.generateCode(
    actionManifest.find((action) => action.name === 'Manage scopes'),
    'actions'
  )
})
const claimName = 'https://parfit.givingwhatwecan.org//scope'
const loginScopes = ['openid', 'profile', 'email', 'read:people']

async function runAction(overrides = {}) {
  const denied = []
  const removedScopes = []
  const claims = new Map()
  // No require, fetch, or secrets are provided. Any SDK/network dependency fails.
  const context = vm.createContext({ exports: {} })
  vm.runInContext(code, context, { timeout: 1000 })
  const event = {
    client: { client_id: clientId },
    resource_server: { identifier: 'https://parfit-local.givingwhatwecan.org' },
    transaction: { requested_scopes: loginScopes },
    ...overrides,
  }
  await context.exports.onExecutePostLogin(event, {
    access: { deny: (reason) => denied.push(reason) },
    accessToken: { removeScope: (scope) => removedScopes.push(scope) },
    idToken: { setCustomClaim: (name, value) => claims.set(name, value) },
  })
  return { denied, removedScopes, claims }
}

test('fresh roleless GWWC user retains the current login scopes and claim name', async () => {
  const result = await runAction({ user: { user_id: 'auth0|fresh' } })
  assert.deepEqual(result.denied, [])
  assert.deepEqual(result.removedScopes, [])
  assert.equal(result.claims.get(claimName), loginScopes.join(' '))
})

test('existing user roles do not change the permitted scopes', async () => {
  const fresh = await runAction()
  const existing = await runAction({
    authorization: { roles: ['Giving What We Can User', 'Parfit User'] },
  })
  assert.deepEqual(existing, fresh)
})

test('GWWC cannot retain extra or administrative API scopes', async () => {
  const result = await runAction({
    transaction: {
      requested_scopes: [...loginScopes, 'update:people', 'read:people:all'],
    },
  })
  assert.deepEqual(result.removedScopes, ['update:people', 'read:people:all'])
  assert.equal(result.claims.get(claimName), loginScopes.join(' '))
})

test('other clients cannot obtain a Parfit API token, including with no API scope requested', async () => {
  for (const scopes of [loginScopes, ['openid', 'email'], []]) {
    const result = await runAction({
      client: { client_id: 'another-client' },
      transaction: { requested_scopes: scopes },
    })
    assert.equal(result.denied.length, 1)
    assert.equal(result.claims.size, 0)
  }
})

test('other clients can still perform basic login without an API audience', async () => {
  const result = await runAction({
    client: { client_id: 'another-client' },
    resource_server: undefined,
    transaction: { requested_scopes: ['openid', 'profile', 'email'] },
  })
  assert.deepEqual(result.denied, [])
  assert.deepEqual(result.removedScopes, [])
  assert.equal(result.claims.size, 0)
})

test('embedded password login reads scope from the request body', async () => {
  const result = await runAction({
    transaction: undefined,
    request: { body: { scope: ' openid  profile email read:people ' } },
  })
  assert.deepEqual(result.denied, [])
  assert.deepEqual(result.removedScopes, [])
  assert.equal(result.claims.get(claimName), loginScopes.join(' '))
})

test('query fallback handles a request with no body', async () => {
  const result = await runAction({
    transaction: undefined,
    request: { query: { scope: loginScopes.join(' ') } },
  })
  assert.equal(result.claims.get(claimName), loginScopes.join(' '))
})

test('transaction scopes take precedence over body and query', async () => {
  const result = await runAction({
    request: {
      body: { scope: 'update:people' },
      query: { scope: 'read:people:all' },
    },
  })
  assert.deepEqual(result.denied, [])
  assert.deepEqual(result.removedScopes, [])
  assert.equal(result.claims.get(claimName), loginScopes.join(' '))
})

test('explicit empty transaction scopes do not fall back to a permissive body', async () => {
  const result = await runAction({
    transaction: { requested_scopes: [] },
    request: { body: { scope: 'read:people' } },
  })
  assert.equal(result.denied.length, 1)
  assert.equal(result.claims.size, 0)
})

test('API login with missing scopes is denied instead of allowing default API grants', async () => {
  for (const request of [
    undefined,
    {},
    { body: {} },
    { query: {} },
    { body: { scope: null } },
  ]) {
    const result = await runAction({ transaction: undefined, request })
    assert.equal(result.denied.length, 1)
    assert.equal(result.claims.size, 0)
  }
})

test('API login with only OIDC scopes is denied in browser and password flows', async () => {
  for (const overrides of [
    { transaction: { requested_scopes: ['openid', 'profile', 'email'] } },
    {
      transaction: undefined,
      request: { body: { scope: 'openid profile email' } },
    },
  ]) {
    const result = await runAction(overrides)
    assert.equal(result.denied.length, 1)
    assert.equal(result.claims.size, 0)
  }
})

test('body and query API audiences also require an explicitly permitted API scope', async () => {
  for (const request of [
    { body: { audience: 'https://parfit-local.givingwhatwecan.org' } },
    { query: { audience: 'https://parfit-local.givingwhatwecan.org' } },
  ]) {
    const result = await runAction({
      resource_server: undefined,
      transaction: undefined,
      request,
    })
    assert.equal(result.denied.length, 1)
  }
})

test('non-string scopes cannot authorize API access', async () => {
  const result = await runAction({
    transaction: undefined,
    request: { body: { scope: ['read:people'] }, query: { scope: 42 } },
  })
  assert.equal(result.denied.length, 1)
})

test('a missing-scope login without an API audience does not throw or invent scopes', async () => {
  const result = await runAction({
    resource_server: undefined,
    transaction: undefined,
  })
  assert.deepEqual(result.denied, [])
  assert.deepEqual(result.removedScopes, [])
  assert.equal(result.claims.get(claimName), '')
})

test('a refresh without explicit scope is rejected; offline access is disabled in the trial tenant', async () => {
  const result = await runAction({
    transaction: { protocol: 'oauth2-refresh-token' },
  })
  assert.equal(result.denied.length, 1)
})

test('manifest disables role assignment and obsolete scope Rules, retaining email and scope Actions', () => {
  assert.deepEqual(
    actionManifest
      .filter((action) => action.enabled)
      .map((action) => action.name),
    ['Add email to access token', 'Manage scopes']
  )
  for (const name of [
    'Add email to access token',
    'Add Default Role To All Users',
    'Filter scopes',
    'Add Scopes to ID Token',
  ]) {
    assert.equal(
      RULE_MANIFEST.find((rule) => rule.name === name).enabled,
      false
    )
  }
})
