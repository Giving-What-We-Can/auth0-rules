import { ManagementClient } from 'auth0'

const { AUTH0_DOMAIN, AUTH0_CLIENT_ID, AUTH0_CLIENT_SECRET } = process.env

const auth0 = new ManagementClient({
  // Use the tenant domain for the Management API, not the branded login domain.
  domain: AUTH0_DOMAIN,
  clientId: AUTH0_CLIENT_ID,
  clientSecret: AUTH0_CLIENT_SECRET,
})

export default auth0
