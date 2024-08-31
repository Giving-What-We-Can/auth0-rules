import {
  getAllClients,
  getAllRoles,
  getCommentValue,
  isValidClient,
  isValidRole,
} from './lib/utils'
const { NODE_ENV } = process.env

/**
 * List of rules that should exist on the Auth0 tenant.
 *
 * Rules will be executed in the order they are defined
 */
export const RULE_MANIFEST: RuleDefinition[] = [
  {
    name: 'Add email to access token',
    file: 'email-to-access-token',
    enabled: true,
    getData: () => {
      const namespace = process.env.TOKEN_NAMESPACE
      return { namespace }
    },
  },
  {
    name: 'Add Default Role To All Users',
    file: 'add-default-roles',
    enabled: true,
    getData: async () => {
      const defaultRoleNames = [
        'User-Basic-Role',
        'Parfit User',
        'Giving What We Can User',
      ]
      const Roles = await getAllRoles()
      const defaultRoles = Roles.filter(isValidRole)
        .filter((Role) => defaultRoleNames.includes(Role.name))
        .map((Role) => getCommentValue({ value: Role.id, roleName: Role.name }))
      return { defaultRoles }
    },
  },
  {
    name: 'Filter scopes',
    file: 'filter-scopes',
    enabled: true,
    getData: async () => {
      const applicationNames = ['Giving What We Can']
      const Clients = await getAllClients()
      const whitelist = Clients.filter(isValidClient)
        .filter((Client) => applicationNames.includes(Client.name))
        .map((Client) =>
          getCommentValue({
            applicationName: Client.name,
            value: Client.client_id,
          })
        )
      return { whitelist }
    },
  },
  {
    name: 'Add Scopes to ID Token',
    file: 'add-scopes-to-id-token',
    enabled: true,
    getData: async () => {
      // Get token namespace
      const namespace = process.env.TOKEN_NAMESPACE

      // Get the list of applications on the whitelist
      const applicationNames = ['Giving What We Can']
      const Clients = await getAllClients()
      const whitelist = Clients.filter(isValidClient)
        .filter((Client) => applicationNames.includes(Client.name))
        .map((Client) =>
          getCommentValue({
            applicationName: Client.name,
            value: Client.client_id,
          })
        )
      return { whitelist, namespace }
    },
  },
  {
    name: 'Log Context',
    file: 'log-context',
    enabled: false,
  },
]

export const ACTION_MANIFEST: ActionDefinition[] = [
  {
    name: 'Add email to access token',
    file: 'email-to-access-token',
    enabled: true,
    trigger: 'post-login',
    triggerVersion: 'v3',
    getData: () => {
      const namespace = process.env.TOKEN_NAMESPACE
      return { namespace }
    },
  },
  {
    name: 'Add Default Role To All Users',
    file: 'add-default-roles',
    enabled: true,
    trigger: 'post-login',
    triggerVersion: 'v3',
    getData: async () => {
      const defaultRoleNames = [
        'User-Basic-Role',
        'Parfit User',
        'Giving What We Can User',
      ]
      const Roles = await getAllRoles()
      const defaultRoles = Roles.filter(isValidRole)
        .filter((Role) => defaultRoleNames.includes(Role.name))
        .map((Role) => getCommentValue({ value: Role.id, roleName: Role.name }))
      return { defaultRoles }
    },
  },
  {
    name: 'Manage scopes',
    file: 'manage-scopes',
    enabled: true,
    trigger: 'post-login',
    triggerVersion: 'v3',
    getData: async () => {
      // Get token namespace
      const namespace = process.env.TOKEN_NAMESPACE

      const allowAllScopesApplicationNames = ['Giving What We Can']

      const scopesToIdTokenApplicationNames = ['Giving What We Can']

      const Clients = await getAllClients()
      const validClients = Clients.filter(isValidClient)
      const allowAllScopesWhitelist = validClients
        .filter((Client) =>
          allowAllScopesApplicationNames.includes(Client.name)
        )
        .map((Client) =>
          getCommentValue({
            applicationName: Client.name,
            value: Client.client_id,
          })
        )

      const addScopesToIdTokenApplications = Clients.filter(isValidClient)
        .filter((Client) =>
          scopesToIdTokenApplicationNames.includes(Client.name)
        )
        .map((Client) =>
          getCommentValue({
            applicationName: Client.name,
            value: Client.client_id,
          })
        )

      return {
        allowAllScopesWhitelist,
        addScopesToIdTokenApplications,
        namespace,
      }
    },
  },
  {
    name: 'Log Context',
    file: 'log-context',
    enabled: false,
    trigger: 'post-login',
    triggerVersion: 'v3',
  },
]

/**
 * List of Database Action Scripts to Deploy.
 *
 * Should contain `login`, `get_user`, and nothing else.
 */
export const DB_MANIFEST: DBActionScriptDefinition[] = [
  {
    name: 'login',
    file: 'login',
    getData: async () => {
      return {
        pgShouldSsl: NODE_ENV !== 'development',
      }
    },
  },
  {
    name: 'get_user',
    file: 'get-user',
    getData: async () => {
      return {
        pgShouldSsl: NODE_ENV !== 'development',
      }
    },
  },
]
