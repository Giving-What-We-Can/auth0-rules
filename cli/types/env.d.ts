declare namespace NodeJS {
  import crypto from 'crypto'

  export interface ProcessEnv {
    NODE_ENV: 'development' | 'staging' | 'production'
    /** Primary domain of Auth0 tenant */
    AUTH0_DOMAIN: string
    /** Auth0 audience */
    AUTH0_AUDIENCE: string
    /**
     * Client ID of connected Auth0 application (should be a machine-to-machine
     * application with access to the Auth0 Management API)
     */
    AUTH0_CLIENT_ID: string
    /** Client secret of connected Auth0 application */
    AUTH0_CLIENT_SECRET: string
    /**
     * Optional assertion of the reviewed tenant claim namespace. Preserve the
     * existing trailing slash in dev; production has no trailing slash. See
     * https://auth0.com/docs/tokens/create-namespaced-custom-claims
     */
    TOKEN_NAMESPACE: string
  }
}
