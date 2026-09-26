import { getAllClients, getCommentValue, isValidClient } from './lib/utils'

/** Only these tenants have a reviewed login configuration. */
export function getLoginTenant() {
  const domain = process.env.AUTH0_DOMAIN
  if (domain === 'giving-what-we-can.us.auth0.com') {
    return {
      environment: 'production',
      namespace: 'https://parfit.givingwhatwecan.org',
    } as const
  }
  if (
    domain === 'giving-what-we-can-dev.us.auth0.com' ||
    domain === 'giving-what-we-can-dev.auth0.com'
  ) {
    return {
      environment: 'development',
      namespace: 'https://parfit.givingwhatwecan.org/',
    } as const
  }
  throw new Error(
    'No reviewed login configuration for AUTH0_DOMAIN. See README.'
  )
}

/** Retire only these known Rules; preserve unlisted Rules such as account linking. */
export const RULE_MANIFEST: RuleDefinition[] = [
  {
    name: 'Add email to access token',
    file: 'email-to-access-token',
    enabled: false,
  },
  {
    name: 'Add Default Role To All Users',
    file: 'add-default-roles',
    enabled: false,
  },
  { name: 'Filter scopes', file: 'filter-scopes', enabled: false },
  {
    name: 'Add Scopes to ID Token',
    file: 'add-scopes-to-id-token',
    enabled: false,
  },
  { name: 'Log Context', file: 'log-context', enabled: false },
]

export function getActionManifest(): ActionDefinition[] {
  const tenant = getLoginTenant()
  // Preserve deployed claim names, including dev's existing double slash.
  if (
    process.env.TOKEN_NAMESPACE &&
    process.env.TOKEN_NAMESPACE !== tenant.namespace
  ) {
    throw new Error(
      'TOKEN_NAMESPACE differs from the reviewed tenant claim namespace.'
    )
  }
  return [
    {
      name: 'Add email to access token',
      file: 'email-to-access-token',
      enabled: true,
      trigger: 'post-login',
      triggerVersion: 'v3',
      getData: () => ({ namespace: tenant.namespace }),
    },
    // Deploy the replacement scope policy before unbinding default roles in dev.
    tenant.environment === 'development'
      ? {
          name: 'Manage scopes',
          file: 'manage-scopes',
          enabled: true,
          trigger: 'post-login',
          triggerVersion: 'v3',
          getData: async () => {
            const clients = (await getAllClients())
              .filter(isValidClient)
              .filter((client) => client.name === 'Giving What We Can')
            if (clients.length !== 1) {
              throw new Error(
                'Expected exactly one Giving What We Can application.'
              )
            }
            const applications = clients.map((client) =>
              getCommentValue({
                applicationName: client.name,
                value: client.client_id,
              })
            )
            return {
              apiScopeApplications: applications,
              addScopesToIdTokenApplications: applications,
              namespace: tenant.namespace,
            }
          },
        }
      : { name: 'Manage scopes', enabled: false, trigger: 'post-login' },
    {
      name: 'Add Default Role To All Users',
      enabled: false,
      trigger: 'post-login',
    },
    { name: 'Expire passwords', enabled: false, trigger: 'post-login' },
    { name: 'Log Context', enabled: false, trigger: 'post-login' },
  ]
}

/** The custom database scripts remain separate from Post Login Actions. */
export const DB_MANIFEST: DBActionScriptDefinition[] = [
  {
    name: 'login',
    file: 'login',
    getData: () => ({
      production: getLoginTenant().environment === 'production',
    }),
  },
  {
    name: 'get_user',
    file: 'get-user',
    getData: () => ({ pgShouldSsl: process.env.NODE_ENV !== 'development' }),
  },
]
