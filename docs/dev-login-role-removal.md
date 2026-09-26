# Dev login without role lookups

Status: user applied the development dashboard trial on 2026-09-26. The source
reconciliation is separate from tenant deployment. Production subsequently
removed default roles and password expiry through operator dashboard changes,
while leaving Manage scopes disconnected. See [current setup](../README.md). No
staging or production rollout has been performed by the assistant.

## Scope and evidence

The original dev trial was based on Auth0 `dev` commit
`c29f94227125918385769b33d31bb9ce93ecb4c4`, the supplied deployed dev Actions,
and Vega checkout `ac8caa8b9`. The user confirmed the only application is GWWC,
using Apollo against Parfit/PostGraphile. The dev tenant may also be used by CI.

User-supplied dev settings:

- Tenant: `giving-what-we-can-dev`.
- GWWC client: `0UXcKzf6y5O3RNdQC7KlUzkLiokPu1y2`.
- Parfit audience: `https://parfit-local.givingwhatwecan.org`.
- RBAC: off. Offline access: off.
- Token namespace: `https://parfit.givingwhatwecan.org/`.
- Original flow: email Action, default-role Action, Manage scopes Action.
- Applied dev flow, shown by user: email Action followed by Manage scopes;
  default-role Action remains stored but is unbound.
- Default-role and Manage scopes rollback versions: Version 4, as shown by user.
- Legacy Rules status: unresolved. Missing navigation and a redirect do not
  establish that no Rules execute.

Vega source evidence:

- `lyra/packages/givingwhatwecan/lib/auth0/scopes.ts:9` requests
  `openid profile email read:people`.
- `lyra/packages/givingwhatwecan/pages/api/auth/embedded_login.ts:51` uses that
  same scope constant for password login.
- `parfit/services/web/middleware/jwt.ts:59` validates audience and issuer.
- `parfit/services/web/postgraphile/index.ts:82` selects `person_role` for a
  verified user, and resolves `person_id` from the token subject.
- `parfit/migrations/20260117234759_drop_unused_scope_functions_up.sql:38`
  removes obsolete scope helpers. Source presence does not prove the target
  database has run the migrations.
- A search of Lyra and Parfit found no consumer of the custom ID-token scope
  claim; this proposal retains that claim anyway.

## Applied development behavior

1. Keep Add email to access token unchanged, including the existing double slash
   in the generated claim keys.
2. Replace Manage scopes' permission pagination with a fixed list: standard
   login scopes plus `read:people` for the GWWC application. Preserve its custom
   ID-token scope claim. Requested extra scopes are removed.
3. Reject API-targeted logins unless GWWC explicitly requests `read:people`.
   Auth0 password exchanges can otherwise receive all API scopes by default.
   This tightens the prior behavior for other clients: their Parfit API requests
   are denied, while basic login without an API audience remains available. This
   does not revoke previously issued tokens or govern machine-to-machine
   client-credentials grants, which do not execute Post Login Actions.
4. Unbind Add Default Role To All Users. Keep its stored Action and existing
   user roles for rollback.
5. Retire repository-managed legacy Rules in source, including the email Rule
   now represented by an Action. The deployer disables existing ones and does
   not recreate absent ones. Unlisted Rules remain untouched.

The new Action does not add scopes, read users, inspect role membership, call
Auth0's Management API, or need secrets. It is intentionally specific to the
current GWWC scope contract. A future client needing extra API scopes needs an
explicit policy review. Do not copy this dev artifact into another tenant.

Refresh without an explicit permitted scope is rejected. Offline access is off
in the supplied dev configuration. If any actual CI or localhost flow uses
refresh tokens, stop the trial and design that contract before deployment.

Auth0 documents the password-exchange default at
https://auth0.com/docs/get-started/authentication-and-authorization-flow/resource-owner-password-flow/call-your-api-using-resource-owner-password-flow.

## Local verification

The offline generator reuses `generateCode` with the supplied public dev values.
It supplies dummy ManagementClient constructor values, does not load `.env`, and
does not request live tenant data. Its output is
`dist/dev-login/manage-scopes.js`.

With the repository's supported Node version:

```fish
yarn test:login
```

The current machine has Node 22, while the repository declares Node 18. The
build and tests were run with the engine check bypassed:

```fish
env YARN_IGNORE_ENGINES=1 yarn test:login
```

The tests exercise the generated code with no SDK, secrets, or network API
available. They verify scope filtering, roleless and existing users, claim
names, embedded body scopes, query fallback, and missing-scope handling. These
tests do not prove Auth0 token issuance, login event shapes, or RLS.

## Verified localhost routing

A read-only HTTP check on 2026-09-26 returned HTTP 200 for
`http://localhost:3000/`. `/api/auth/login` returned HTTP 302 to
`https://login.dev.givingwhatwecan.org/authorize` with the expected dev client,
Parfit audience, `openid profile email read:people`, and callback
`http://localhost:3000/api/auth/callback`. Redirects were not followed and
session cookies were not displayed. This verifies routing, not successful login.
The browser-control tool failed to start due to the workspace symlink sandbox
error; interactive verification below was performed and reported by the user.

The original local build and generated-Action test run passed all 16 tests on
Node 22 with Yarn's engine check bypassed. The user subsequently exercised
normal login paths with the deployed Action on Auth0 Node 18, as described
below.

## User-confirmed dev trial results, 2026-09-26

- Deployed the generated Manage scopes Action in the dev tenant. The supplied
  screenshot shows the successful deployment and Node 18 runtime.
- Existing-user logout and login succeeded after deployment.
- Removed default-role assignment from Post Login and applied the flow. The
  supplied screenshot shows email followed by Manage scopes and all changes
  live.
- Created a new dev user after removal. Logout and login succeeded; the supplied
  Auth0 Roles screenshot shows no assigned roles.
- In response to the requested Account check, the user confirmed that the new
  user's own-data reads and a harmless saved profile edit work after reload.

These results establish the tested roleless user's normal login and own-data
path. They do not establish cross-user isolation, all issued token claims,
rejection of malformed scope requests, or absence of every legacy Rule. No
measured login latency improvement or complete tenant-wide Management API call
elimination is claimed.

## Assistant-run verification, 2026-09-26

- Dispatched the existing `gwwc-e2e` workflow on Vega dev commit
  `0993cbda4fb06c35dc2f3bfac5d1c47f63e7edb8`:
  https://github.com/Giving-What-We-Can/vega/actions/runs/36244873774. All eight
  shards and E2E Success passed. Log totals were 243 passing test executions,
  including setup repeated per shard, and 16 intentionally skipped worker logins
  (workers 2 and 3 with only two workers configured). Login setup and pledge
  signup scenarios executed. This was a manual run, with snapshot commits
  disabled.
- CI uses encrypted environment files. Their Auth0 tenant could not be read
  independently. A read-only attempt to obtain a dev Management token using the
  local backend client returned HTTP 401 Unauthorized; no Management reads were
  made. This prevents correlating CI worker last-login times with the tenant.
- To verify the known tenant independently, ran the existing Playwright auth
  setup against localhost, whose login URL and configuration were confirmed as
  `login.dev.givingwhatwecan.org`, the supplied GWWC client, and local Parfit
  audience. Fresh auth state was isolated under `/tmp/gwwc-auth0-verification`.
  Both cookie setup tests and the browser login passed; three unused worker
  logins were skipped with one worker configured.
- Created two disposable dev Auth0 accounts using the application's signup
  endpoint contract, then logged each in through localhost's actual
  `/api/auth/embedded_login` route and synced each through local GraphQL.
  Audience and client matched. Actual issued access-token scopes were exactly
  `openid profile email read:people`. Existing double-slash email and
  email_verified claims were present and correct; the ID-token scope claim
  matched. The local GraphQL server accepted the issued tokens.
- Both accounts successfully wrote and reread their own synthetic birth dates.
  Each account's attempt to read the other's private person record returned
  null. Each cross-user mutation returned no person, and a subsequent read as
  the owner confirmed the birth date was unchanged. This tests the person
  read/update path, not every resource's RLS.
- A direct dev password-grant request with additional `update:people` succeeded
  but its issued token omitted that scope. Requests with missing scope,
  OIDC-only scopes, and disallowed API scope only all returned `access_denied`
  with the deployed Action's exact denial message and no access token. Auth0
  returned HTTP 500 for these intentional denials. The first temporary test
  expected 403 and failed on that assumption; the subsequent checks verified the
  error payload and absence of tokens instead.
- Two initial signup fixtures used `.invalid` and `example.com` addresses; Auth0
  accepted signup but Parfit's email validator rejected account sync. The
  successful pair used reserved `example.org` addresses after inspecting the
  validator. Four disposable Auth0 accounts were created in total, two with
  corresponding local person records. No existing user was modified and no test
  accounts were deleted.

Direct-test scripts and redacted result summaries are under
`/tmp/gwwc-auth0-verification`. Credentials and tokens were not printed or
committed. These checks establish current dev behavior without measuring the
latency contribution of individual Actions. No Auth0 Action or application
implementation was changed during these checks.

## Further simplification review, not implemented

1. Password login currently calls syncAuth0User and then refreshPerson in
   `lyra/packages/givingwhatwecan/components/Auth/LoginModal.tsx:141`. The sync
   mutation already returns person fields, and PersonProvider's `syncUser`
   already installs that result into context at
   `lyra/packages/common/components/PersonProvider/index.tsx:144`. Share this
   completion path and consume the returned person to remove the subsequent
   getPerson request. Preserve error propagation: the existing provider helper
   catches errors, whereas the modal must stop on sync failure.
2. No custom ID-token scope-claim reader was found in the inspected application
   and backend code. The block in `scripts/actions/src/manage-scopes.ts:56` and
   its separate client-template list are candidates for removal, followed by
   browser verification. Keep the actual access-token scope policy.
3. The email claim setters can be included in the same Action as scope handling,
   allowing a single Post Login Action. Preserve exact claim names and the
   intended behavior for non-GWWC authentication flows; do not remove email
   behavior. `people.sync_auth0_user` reads and checks the signed email and
   email_verified claims in `parfit/migrations/_schema.sql:10087`. A reduction
   in Action count alone does not establish a latency improvement.

Do not remove account syncing wholesale: it creates or links the local person
record and checks the authenticated subject and email. Do not drop Manage scopes
without replacing its policy: the dev API has RBAC off and the supplied API
configuration permits all applications for user-delegated access. Today's checks
verified that the Action actively strips extra scopes and rejects requests
without the required API scope. Native API access configuration could be a
separate future change, with its own equivalence checks.

## Before the dev trial

1. Confirm localhost:3000 uses this dev tenant, this client, and the local
   Parfit audience. Never provide raw tokens, passwords, or client secrets in
   chat. Have the dev server and local Parfit/database running.
2. Avoid overlapping this change with a CI run using the same tenant. Record the
   current code, deployed versions, and flow ordering. Leave RBAC,
   application-access settings, dependencies, secrets, and runtime unchanged
   during this trial.
3. Use an existing dev account to establish a baseline: normal login, dashboard
   reads, and one reversible profile or reported-donation update. Also exercise
   embedded password login if that is used by CI.
4. Inspect issued token metadata locally: audience, authorized client, scopes,
   and the exact email/email_verified claim names. Compare sizes before/after
   without exporting token strings. The ID-token scope claim alone is not proof
   of actual access-token scope values.
5. If dev Management API access is already available, use a token with
   `read:rules` to inspect `GET /api/v2/rules` with pagination. Record only rule
   names and enabled states. An authorization error is not an empty list. If old
   role or scope Rules are active, resolve them before testing removal.
   Otherwise keep that uncertainty open and check fresh-user roles and token
   results explicitly during the trial.

## Dashboard changes, dev only

The user performs these steps, or separately authorizes scoped dev access.

1. Open Actions > Library > Manage scopes in `giving-what-we-can-dev`.
2. Replace its code with the entire generated `dist/dev-login/manage-scopes.js`,
   including Template data. Save and deploy.
3. Confirm the newly deployed version is in the current Post Login flow. Repeat
   the baseline existing-user login before proceeding.
4. Open Actions > Triggers > Post Login. Remove Add Default Role To All Users
   from the flow, then Apply. Do not delete the stored Action or any user roles.
5. Confirm the applied flow contains email followed by Manage scopes.

## Required real dev checks

Use fresh authentication requests, not a cached application session.

| Case                                                   | Required result                                                                                        |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| Existing GWWC user                                     | Login and dashboard GraphQL reads succeed.                                                             |
| New GWWC user                                          | Sign up after unbinding; login succeeds without assigned roles. Check User Management > Users > Roles. |
| New user's own data                                    | Current-person query and a reversible own-data mutation succeed.                                       |
| Another dev user's private record                      | No unauthorized read or update through GraphQL; use synthetic test data and known private fields.      |
| Embedded password flow used by CI                      | Login and subsequent authenticated GraphQL requests succeed.                                           |
| Extra requested API scope                              | Access token does not gain the extra scope.                                                            |
| Missing scope or only OIDC scopes with Parfit audience | Authentication is rejected; no API access token is issued.                                             |
| Email claims                                           | Exact existing names and values remain present where they were present before.                         |
| Token/cookie size                                      | No growth that causes callback/header failures.                                                        |
| Authentication logs                                    | No Action failures; record Action timings and login error counts for comparable runs.                  |
| CI using this tenant                                   | Relevant login/E2E suite succeeds after the local checks.                                              |

For ownership checks, use the existing query/mutation generated by the app
against two disposable dev accounts. Authenticate as A and substitute B's
private resource ID. Select fields that are private under existing RLS; public
profile information is not a valid negative test. For attempted updates, use a
reversible value and verify B's stored value did not change.

If fresh users still acquire roles, investigate another writer or legacy Rule.
If roleless users lose `read:people`, check actual RBAC, legacy scope filtering,
and which Action version executed. Do not compensate by blindly adding scopes.
No claim of lower real latency or absence of all tenant Management API calls is
made until the live checks provide evidence.

## Rollback

1. Reinsert Add Default Role To All Users between email and Manage scopes; Apply
   the flow change.
2. Restore Manage scopes Version 4 using Version History and ensure it is
   deployed. Restore any legacy Rule states changed during the trial.
3. Log in again. A roleless test user should receive the baseline roles through
   the restored role Action. Verify baseline dashboard access.

## Source reconciliation and later environments

The manifest now selects the reviewed development or production policy from the
Management API tenant domain, rejects unknown tenants, and preserves each
namespace. Production keeps Manage scopes disconnected. Disabled Actions manage
bindings only, preserving rollback code; absent retired Rules are not recreated.

The deployer now reports failure after exhausted retries, passes pagination in
the SDK request parameters, and deploys dev's replacement scopes before removing
role assignment. Offline tests cover these changes; they are not a live rollout.
Actions diff now shows binding changes as well as active draft-code differences.

The automatic deployment workflow has been removed in this revision. Tests run
locally; deployment uses the existing category-specific CLI commands described
in the README. Branches still containing the old workflow keep their automatic
deployment behavior until the removal reaches them. Production inspection,
deployment, and verification remain operator-run.
