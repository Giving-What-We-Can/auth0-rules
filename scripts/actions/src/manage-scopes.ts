import {
  DefaultPostLoginApi,
  DefaultPostLoginEvent,
} from '../types/auth0-actions'

const DEFAULT_SCOPES = ['openid', 'profile', 'email', 'offline_access']
// GWWC requests this API scope to keep token size bounded. Parfit authorizes
// GraphQL operations using the authenticated person and database row ownership.
const PARFIT_SCOPES = ['read:people']

/** Restrict requested scopes without reading or assigning Auth0 user roles. */
exports.onExecutePostLogin = async (
  event: DefaultPostLoginEvent,
  api: DefaultPostLoginApi
) => {
  const clientId = event.client.client_id
  const apiScopeApplications: string[] = TEMPLATE_DATA.apiScopeApplications
  const allowedScopes = apiScopeApplications.includes(clientId)
    ? [...DEFAULT_SCOPES, ...PARFIT_SCOPES]
    : DEFAULT_SCOPES

  // Embedded password login can supply scope in the request body instead of
  // transaction.requested_scopes. Missing scope values must not throw.
  const bodyScope = event.request?.body?.scope
  const queryScope = event.request?.query?.scope
  const requestedScopes: string[] =
    event.transaction?.requested_scopes ??
    (typeof bodyScope === 'string'
      ? bodyScope.split(/\s+/).filter(Boolean)
      : typeof queryScope === 'string'
      ? queryScope.split(/\s+/).filter(Boolean)
      : [])

  // Auth0 password exchanges can grant all API scopes when no API scope is
  // requested. Reject that case instead of relying on removal of requested scopes.
  // Dev has offline access disabled; a future refresh flow needs explicit testing.
  const hasApiAudience = Boolean(
    event.resource_server?.identifier ||
      event.request?.body?.audience ||
      event.request?.query?.audience
  )
  const hasAllowedApiScope =
    apiScopeApplications.includes(clientId) &&
    requestedScopes.some((scope) => PARFIT_SCOPES.includes(scope))
  if (hasApiAudience && !hasAllowedApiScope) {
    api.access.deny('This application must request an allowed API scope.')
    return
  }

  for (const scope of requestedScopes) {
    if (!allowedScopes.includes(scope)) {
      api.accessToken.removeScope(scope)
    }
  }

  // Retain the existing ID-token claim while the dev login flow is verified.
  // This describes permitted requested scopes, not the final issued token.
  const requiredApplications: string[] =
    TEMPLATE_DATA.addScopesToIdTokenApplications
  if (requiredApplications.includes(clientId)) {
    const namespace: string = TEMPLATE_DATA.namespace
    const finalScopes = requestedScopes.filter((scope) =>
      allowedScopes.includes(scope)
    )
    api.idToken.setCustomClaim(`${namespace}/scope`, finalScopes.join(' '))
  }
}
