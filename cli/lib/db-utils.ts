const { NODE_ENV } = process.env

const CONNECTION_NAMES = {
  development: 'Username-Password-Authentication',
  staging: 'Username-Password-Authentication',
  production: 'Username-Password-Authentication',
}
/**
 * We could not use the first Username-Password authentication connection we set
 * up for development, because it would not let us turn on user migration. See
 * the README for details.
 */
export const CONNECTION_NAME =
  CONNECTION_NAMES[NODE_ENV] || 'Username-Password-Authentication'
