<!-- START doctoc generated TOC please keep comment here to allow auto update -->
<!-- DON'T EDIT THIS SECTION, INSTEAD RE-RUN doctoc TO UPDATE -->

## Contents

- [GWWC Auth0 configuration](#gwwc-auth0-configuration)
  - [Current login setup](#current-login-setup)
    - [Signup and password reset](#signup-and-password-reset)
    - [Completed checks and rollback](#completed-checks-and-rollback)
  - [Local build and tests](#local-build-and-tests)
  - [Operator CLI](#operator-cli)
    - [Manual deployment](#manual-deployment)
  - [Source layout](#source-layout)
  - [Remaining work](#remaining-work)

<!-- END doctoc generated TOC please keep comment here to allow auto update -->

# GWWC Auth0 configuration

TypeScript sources and a CLI for Auth0 Post Login Actions, retired Rules, custom
database scripts, and login templates. This repository was forked from CEA;
historical pull requests are in the
[archive](https://drive.google.com/drive/folders/1I8SAENok6iYvBIEeAqsGh7vi41jpr5G5).

## Current login setup

Snapshot: **2026-09-26**, based on operator-supplied tenant settings and tests.
The source has been reconciled; publishing and deployment are separate.

| Tenant                            | Active Post Login flow                         | Claim namespace                       |
| --------------------------------- | ---------------------------------------------- | ------------------------------------- |
| `giving-what-we-can` (production) | Account-linking legacy Rule → email Action     | `https://parfit.givingwhatwecan.org`  |
| `giving-what-we-can-dev`          | Email Action → simplified Manage scopes Action | `https://parfit.givingwhatwecan.org/` |

Production's only inventoried legacy Rule is `auth0-account-link-extension`. The
CLI leaves this unlisted Rule alone. Dev legacy Rules were not independently
inventoried. Namespace spelling is intentional: appending `/email` produces a
double slash in dev and a single slash in production. Preserve the claim keys.

- **Email Action:** puts email and verification status in the access token for
  Parfit's account synchronization.
- **Manage scopes:** enabled only in dev. Allows standard login scopes plus
  `read:people` for the GWWC application, removes other requested scopes, and
  rejects API-targeted requests without that permitted scope. Retains the custom
  ID-token scope claim, without permission lookups. Production's older stored
  version remains disconnected and is not overwritten by deployment.
- **Default-role assignment:** disconnected in both reviewed tenants. Existing
  user roles and stored rollback Actions remain.
- **Expire passwords:** disconnected in production after advanced user search
  found no indexed `user_metadata.password_expires_at` markers. A successful
  `_exists_:email` control confirmed the search mode. The marker's writer is
  unknown.

The website requests `openid profile email read:people`. Parfit validates access
tokens and authorizes requests through PostgreSQL roles, person identity, and
RLS. Auth0 user roles are distinct from PostgreSQL roles. Parfit API RBAC and
offline access are off in the supplied settings. Production permits all
applications for user-delegated access and uses per-app authorization for
machine-to-machine access; actual machine-to-machine usage remains unverified.

### Signup and password reset

The duplicate-email lookup lives under **Authentication → Database →
Username-Password-Authentication → Custom Database**, not Pre User Registration.
Production has **Use my own database** and **Import Users to Auth0** enabled,
signups enabled, and an empty Pre User Registration Action flow.

- `get_user` queries `people.person` by email during signup/password reset. It
  can find people with no Auth0 identity, including donation-created records.
- `login` rejects legacy passwords and directs production users to reset theirs.
  It does not authenticate passwords against Parfit. Migrated users authenticate
  against Auth0's stored credentials.
- Social identity linking uses the separate extension Rule. The external linking
  service and recovery of a Parfit-only account still need end-to-end
  verification.

Keep these scripts/import settings pending that verification. See the
[Vega authentication overview](https://github.com/Giving-What-We-Can/vega/blob/dev/lyra/docs/Auth0.md)
for application sessions and bidirectional profile synchronization.

### Completed checks and rollback

The operator tested production logout/login, donation reporting, and a fresh
signup with no roles after removing default-role assignment; email/password
login passed after removing password expiration. Email claims, API settings,
custom database configuration, and account linking were retained. No login
latency improvement was measured.

Rollback in **Actions → Triggers → Post Login**: reattach the retained Action
and Apply. Original production order: legacy Rule → email → default roles →
password expiry. Dev's scope policy and its validation are documented in
[the dev verification record](docs/dev-login-role-removal.md).

## Local build and tests

The repository still declares **Node 18** and uses Yarn Classic. That toolchain
and the deployed runtime warnings need a separate upgrade; the CLI does not set
an Action runtime. Local builds/tests also passed on Node 22 with the Yarn
engine check bypassed. Neither build nor test commands load `.env` or contact
Auth0.

```fish
yarn install --frozen-lockfile
yarn test:login
```

On Node 22, use `env YARN_IGNORE_ENGINES=1 yarn test:login` with dependencies
already installed. This compiles both projects, generates the dev review
artifact at `dist/dev-login/manage-scopes.js`, and runs offline scope/deployer
tests. Mocks verify our request construction and mutation choices, not the live
Auth0 contract, actual token issuance, or deployed permissions.

## Operator CLI

`yarn cli` loads `.env`. Diff commands contact Auth0 and may print deployed
code; keep their output private. Production inspection and deployment are
operator-run.

Required environment entries:

| Variable                                 | Meaning                                                                                                                                               |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AUTH0_DOMAIN`                           | Tenant host without scheme, not a branded login domain                                                                                                |
| `AUTH0_CLIENT_ID`, `AUTH0_CLIENT_SECRET` | Dedicated Management API client credentials                                                                                                           |
| `TOKEN_NAMESPACE`                        | Optional assertion; must equal the reviewed tenant namespace above                                                                                    |
| `NODE_ENV`                               | `development` disables PostgreSQL SSL in generated Get User; otherwise SSL is enabled. Never use `development` when generating production DB scripts. |

Login configuration accepts `giving-what-we-can.us.auth0.com` and development's
`giving-what-we-can-dev.us.auth0.com` / `giving-what-we-can-dev.auth0.com` host
forms. Other tenants are rejected by Actions/Rules commands and Login-script
generation until their flow is reviewed. `NODE_ENV` does not select the Action
policy.

Grant only permissions required by the selected command and its generator:
Actions read/write and trigger-binding access; Rules read/update; connections
read/update for DB scripts; clients read for dev's application lookup; branding
and prompt permissions for login templates. Confirm exact endpoint scopes in the
[Management API reference](https://auth0.com/docs/api/management/v2). The
reconciliation commands no longer look up roles. The CLI credentials are
separate from PostgreSQL credentials stored on the database connection.

Available command groups: `actions`, `rules`, `db`, `login`; each has `diff` and
`deploy`. For example, the operator can preview Actions with:

```fish
yarn build
yarn cli actions diff
```

Deployment behavior:

- **Actions:** active definitions generate/deploy code and bind in manifest
  order. Disabled entries only unbind existing Actions; stored code, versions,
  secrets, and dependencies remain untouched. Missing disabled Actions are not
  created. Unlisted Actions/bindings remain. Dev scopes deploy before roles
  unbind.
- **Rules:** known retired Rules are disabled if present; absent ones are not
  recreated. Their code and unlisted Rules are preserved.
- **DB:** replaces the manifest's `login` and `get_user` scripts on
  `Username-Password-Authentication`, retaining other connection
  options/scripts. Production Login generation preserves the supplied
  spinout-era recovery message.
- **Login:** replaces Universal Login template and signup text.

Actions diff shows binding changes and desired managed order, plus active Action
**draft-code** differences. It does not verify deployed versions, runtime,
dependencies, or secrets. Rules diff shows retirement state. Preview the
relevant command and verify the result in the dashboard; a code-only match is
insufficient.

### Manual deployment

This revision has no GitHub Actions workflow. Run tests locally and deploy
manually using the existing CLI; committing or pushing this revision does not
sync Auth0. Branches that still contain the old workflow retain their automatic
deployment behavior until it is removed there too.

1. Update source and run `yarn test:login` (use the Node 22 override above if
   needed).
2. Set the intended tenant and credentials in `.env`, using `.env-example` as a
   guide. Confirm the tenant matches the dashboard you intend to update.
3. Run the diff for the category being changed, for example
   `yarn cli actions diff`. Review its entire scope and save the current code
   and flow order for rollback.
4. Deploy that category with `yarn cli actions deploy`. Each command applies the
   whole category; Actions deployment includes the binding changes listed above.
   Use `rules`, `db`, or `login` only when that category needs updating.
5. Check the dashboard and affected login/signup flows. Record the result and
   reconcile any dashboard edits back into source.

Deployments are not atomic: a failure can leave earlier changes applied. Inspect
the resulting state before retrying. An Action deployment failure returns a
nonzero exit status after five attempts.

## Source layout

- `cli/manifests.ts`: reviewed tenant policy, Action bindings, retired Rules, DB
  scripts.
- `cli/commands/`: `diff` and `deploy` implementations.
- `scripts/{actions,rules,db}/src/`: TypeScript compiled into standalone
  scripts.
- `templates/`: Universal Login markup and signup text.
- `dist/`: ignored build output; do not edit generated files.

`yarn build` compiles the CLI (ES5 target) and scripts (ES2020 target). Separate
watch commands are available in `package.json`. `getData()` values are
serialized as `TEMPLATE_DATA`: at file scope for Actions, inside functions for
Rules/DB scripts. `getCommentValue()` adds readable labels to generated lists of
IDs. Runtime libraries must be available in Auth0; local imports are not bundled
into Actions.

## Remaining work

- Migrate the account-linking Rule before Auth0's published
  [Rules end of life on November 18, 2026](https://auth0.com/docs/customize/rules).
  Test authentication of both identities and preservation of the primary
  account.
- Verify existing-email signup and legacy password recovery before simplifying
  the custom database integration.
- Fix Get User's global TLS-verification bypass and guarantee connection cleanup
  after failures. This reconciliation deliberately preserves its deployed
  behavior.
- Upgrade the Node toolchain and deployed runtimes.
- Review application access restrictions separately; enabling production's old
  Manage scopes code is not part of this reconciliation.
