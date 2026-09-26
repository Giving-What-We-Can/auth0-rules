import { generateCode, getAllActions, printCodeDiff } from '../../lib/utils'
import { Change, diffLines } from 'diff'
import { getActionManifest } from '../../manifests'
import auth0 from '../../lib/client'
import { paginateNestedQuery } from '../../lib/utils'
import { GetActions200ResponseActionsInner as Action } from 'auth0'
import { cyan, green, grey, magenta, red } from 'chalk'

type DiffPair = [ActionDefinition, Action | undefined]

export default async function run() {
  const actionManifest = getActionManifest()
  const liveActions = await getAllActions()
  const bindings = await paginateNestedQuery(
    (pagination) =>
      auth0.actions.getTriggerBindings({
        triggerId: 'post-login',
        ...pagination,
      }),
    'bindings'
  )()
  console.log('Post Login binding changes (unlisted Actions are preserved):')
  for (const definition of actionManifest) {
    const action = liveActions.find(
      (candidate) => candidate.name === definition.name
    )
    const bound = bindings.some((binding) => binding.action.id === action?.id)
    console.log(
      `- ${definition.name}: ${bound ? 'bound' : 'unbound'} -> ${
        definition.enabled ? 'bound' : 'unbound'
      }`
    )
  }
  console.log(
    `Desired managed order: ${actionManifest
      .filter((definition) => definition.enabled)
      .map((definition) => definition.name)
      .join(' -> ')}`
  )
  // Match actions in the manifest to existing Auth0 actions
  const matches: DiffPair[] = actionManifest.map((actionDef) => [
    actionDef,
    liveActions.find((action) => actionDef.name === action.name),
  ])
  // Actions that exist on Auth0 but are not defined in the manifest
  const extras: Action[] = liveActions.filter((action) =>
    actionManifest.every((actionDef) => actionDef.name !== action.name)
  )
  const diffs: [ActionDefinition, Change[]][] = []
  const missingActions: ActionDefinition[] = []

  // generate the diffs
  for (const [actionDef, action] of matches) {
    if (!actionDef.enabled) continue
    if (!action?.code) {
      missingActions.push(actionDef)
      continue
    }
    const script = await generateCode(actionDef, 'actions')
    diffs.push([actionDef, diffLines(action.code, script)])
  }
  // print the diffs
  const upToDateActions = printCodeDiff(diffs, 'actions')
  if (upToDateActions.length) {
    console.log(`\n[[ Up-to-date actions ]]`)
    console.log(
      grey(
        `${
          upToDateActions.length === actionManifest.length
            ? 'All'
            : upToDateActions.length
        } actions defined in the manifest are identical to the drafts on the Auth0 tenant (not a deployed-version check):`
      )
    )
    console.log(
      `${upToDateActions.map((action) => `- ${cyan(action.name)}`).join('\n')}`
    )
  }

  if (missingActions.length) {
    console.log(`\n[[ Missing actions ]]`)
    console.log(
      grey(
        `${missingActions.length} actions defined in the manifest do not exist on the Auth0 tenant:`
      )
    )
    console.log(
      `${missingActions
        .map((action) => `- ${magenta(action.name)}`)
        .join('\n')}`
    )
  }

  if (extras.length) {
    console.log(`\n[[ Extra actions ]]`)
    console.log(
      grey(
        `${extras.length} actions exist on the Auth0 tenant that are not included in the manifest:`
      )
    )
    console.log(
      `${extras.map((action) => `- ${magenta(action.name)}`).join('\n')}`
    )
  }
}
