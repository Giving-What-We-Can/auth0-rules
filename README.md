# GWWC Auth0 configuration

Sources and a manual CLI for Auth0 Actions, legacy Rules, custom database
scripts, and login templates.

## Current setup

Operator-confirmed snapshot: **2026-09-26**. Source changes do not deploy
themselves.

| Tenant                            | Active Post Login flow                     | Claim namespace                       |
| --------------------------------- | ------------------------------------------ | ------------------------------------- |
| Production (`giving-what-we-can`) | Account-linking legacy Rule → email Action | `https://parfit.givingwhatwecan.org`  |
| Dev (`giving-what-we-can-dev`)    | Email Action → Manage scopes Action        | `https://parfit.givingwhatwecan.org/` |

- **Email:** adds signed email and verification claims used by Parfit account
  syncing. Preserve the namespace: dev has double-slash claim keys.
- **Scopes:** dev allows standard login scopes plus `read:people` for GWWC,
  removes other requested scopes, and denies API-targeted requests without that
  allowed scope. It retains the ID-token scope claim without Management API
  lookups. Production's older Manage scopes Action stays disconnected.
- **Retired Actions:** default-role assignment is disconnected in both tenants;
  password expiry is disconnected in production. Stored Actions and user roles
  remain for rollback. The corrected production metadata search found no indexed
  password-expiry markers; the original writer is unknown.
- **Account linking:** production's `auth0-account-link-extension` Rule remains.
  Unlisted Rules are untouched by the CLI. Dev legacy Rules were not
  inventoried.

The website requests `openid profile email read:people`. Parfit validates tokens
and enforces data access using PostgreSQL roles, person identity, and RLS. Auth0
user roles are separate. The supplied API settings have RBAC and offline access
off; production permits all apps for user-delegated access and per-app
machine-to-machine authorization.

### Signup and recovery

The existing-email check is the **Get User** script under **Authentication →
Database → Username-Password-Authentication → Custom Database**. It queries
Parfit's `people.person` by email during signup/password reset, including people
without an Auth0 identity. Production has **Use my own database** and **Import
Users to Auth0** enabled, with signups enabled and no Pre User Registration
Action.

The custom **Login** script rejects legacy passwords; migrated users
authenticate against Auth0. Source now uses one generic error with a "Forgot
Password" hint. This replaces the dated production wording only when database
scripts are manually deployed. Account linking and legacy recovery still need
verification before their behavior is changed.

See
[Vega's auth overview](https://github.com/Giving-What-We-Can/vega/blob/dev/lyra/docs/Auth0.md)
for sessions and account synchronization.

Verified: existing and new roleless logins work in both tenants; production
donation reporting works. Dev checks also confirmed exact token scopes/claims,
rejection of invalid scope requests, and isolation between two users' private
person records. These checks do not cover every resource's RLS or legacy account
recovery. No login latency improvement was measured.

## Build and test locally

Yarn Classic and Node 18 are declared; a runtime upgrade remains separate work.
Builds and tests do not load `.env` or contact Auth0.

```fish
yarn install --frozen-lockfile
yarn test:login
```

With dependencies already installed on Node 22, use
`env YARN_IGNORE_ENGINES=1 yarn test:login`. It builds both TypeScript projects
and tests generated Actions and deployment behavior offline. Tests use fake
configuration through the same generator as the CLI. Mocks do not establish live
Auth0 contracts or actual token issuance.

## Manual deployment

This revision removes the GitHub deployment workflow. Branches retaining the old
workflow still deploy automatically until the removal reaches them.

1. Update source and run the local tests above.
2. Configure `.env` from `.env-example`. Confirm the intended tenant in the
   dashboard. `yarn cli` loads this file; credentials must stay uncommitted.
3. Preview the relevant category, for example `yarn cli actions diff`. Save the
   current code and flow order for rollback. Diff output may contain deployed
   code, so keep it private.
4. Run `yarn cli actions deploy` only after reviewing the preview. Substitute
   `rules`, `db`, or `login` only when that category needs updating.
5. Verify the dashboard and affected user flows. Copy dashboard edits back into
   source to prevent drift. Production commands are operator-run.

For rollback, restore the saved code/version and flow order in the dashboard.
Disconnected library Actions can be reattached without recreating them.

Each deploy applies a whole category and is **not atomic**. After a failure,
inspect what changed before retrying. Action deployment fails with a nonzero
exit status after five attempts.

| Category  | Deployment effect                                                                                                                                                                                       |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `actions` | Deploys/binds enabled Actions in manifest order. Disabled entries only unbind existing Actions, preserving rollback code and versions. Unlisted bindings remain. Dev scopes deploy before roles unbind. |
| `rules`   | Disables known retired Rules; never recreates missing ones. Preserves scripts and unlisted Rules.                                                                                                       |
| `db`      | Updates `login` and `get_user` on `Username-Password-Authentication`, preserving other connection options/scripts.                                                                                      |
| `login`   | Updates the Universal Login template and signup text.                                                                                                                                                   |

Actions diff reports binding changes and active **draft-code** differences; it
does not compare deployed versions, runtime, dependencies, or secrets.

### Configuration

- `AUTH0_DOMAIN`: tenant host without scheme. Actions, Rules, and DB commands
  accept `giving-what-we-can.us.auth0.com`,
  `giving-what-we-can-dev.us.auth0.com`, or `giving-what-we-can-dev.auth0.com`.
- `AUTH0_CLIENT_ID`, `AUTH0_CLIENT_SECRET`: dedicated Management API credentials
  with permissions for the chosen commands. See the
  [endpoint permissions](https://auth0.com/docs/api/management/v2).
- `TOKEN_NAMESPACE`: optional assertion of the exact namespace above.
- `NODE_ENV`: `development` disables PostgreSQL SSL in generated Get User; leave
  it at `production` for remote databases. It does not select the tenant.

## Source map and follow-ups

`cli/manifests.ts` defines tenant policy; `cli/commands/` implements
diff/deploy. Sources are in `scripts/{actions,rules,db}/src/` and `templates/`.
`dist/` is ignored build output. The generator injects `getData()` as
`TEMPLATE_DATA`; local imports are not bundled into Actions.

Remaining work:

- Migrate account linking before
  [Rules end of life](https://auth0.com/docs/customize/rules), preserving the
  primary account and authenticating both identities.
- Verify existing-email signup and legacy password recovery.
- Fix Get User's global TLS-verification bypass and connection cleanup.
- Upgrade the Node toolchain and deployed runtimes.
- Review API application access separately from this reconciliation.
- Clean up four disposable dev Auth0 test users from the verification work; two
  also have local Parfit records. Identify the exact test records before
  deletion.
