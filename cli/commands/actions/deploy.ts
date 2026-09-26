import { generateCode, paginateNestedQuery } from '../../lib/utils'
import auth0 from '../../lib/client'
import { getActionManifest } from '../../manifests'
import { red, green } from 'chalk'
import { exit } from 'process'
import { getAllActions } from '../../lib/utils'
import {
  GetActions200ResponseActionsInner as Action,
  PatchBindingsRequestBindingsInnerOneOf,
} from 'auth0'

const { AUTH0_DOMAIN, AUTH0_CLIENT_ID, AUTH0_CLIENT_SECRET } = process.env

const getBindingName = (actionDef: ActionDefinition) =>
  `${actionDef.name}_${actionDef.trigger}`

/**
 * Actions are enabled or disabled by binding them to a trigger. This function binds/unbinds
 * the action as applicable.
 */
async function ensureTriggerBindingState({
  bindingName,
  actionId,
  triggerId,
  bound,
  insertAfter,
}: {
  bindingName: string
  actionId: string
  triggerId: string
  bound: boolean
  /** `name`s of the other bindings that should come before this one */
  insertAfter: string[]
}) {
  const prevTriggerBindings = await paginateNestedQuery(
    (pagination) =>
      auth0.actions.getTriggerBindings({ triggerId, ...pagination }),
    'bindings'
  )()

  const otherTriggerBindings: PatchBindingsRequestBindingsInnerOneOf[] =
    prevTriggerBindings
      .map((tb) => ({
        display_name: tb.display_name,
        ref: {
          type: 'action_id' as const,
          value: tb.action.id,
        },
      }))
      .filter((tb) => tb.ref.value !== actionId)

  if (bound) {
    const indices = insertAfter.map((name) =>
      otherTriggerBindings.findIndex((tb) => tb.display_name === name)
    )
    const lastInsertIndex = Math.max(...indices, -1)

    const updatedBindings = [...otherTriggerBindings]
    updatedBindings.splice(lastInsertIndex + 1, 0, {
      display_name: bindingName,
      ref: {
        type: 'action_id',
        value: actionId,
      },
    })

    await auth0.actions.updateTriggerBindings(
      { triggerId },
      {
        bindings: updatedBindings,
      }
    )
    console.log(`Action enabled and ordering updated ${green(`\u2713`)}`)
  } else {
    await auth0.actions.updateTriggerBindings(
      { triggerId },
      { bindings: otherTriggerBindings }
    )
    console.log(`Action disabled ${green(`\u2713`)}`)
  }
}

async function deployAction({
  actionDef,
  existingActions,
  insertAfter,
}: {
  actionDef: ActionDefinition
  existingActions: Action[]
  insertAfter: string[]
}) {
  const existingAction = existingActions.find(
    (existing) => existing.name === actionDef.name
  )

  if (!actionDef.enabled) {
    if (existingAction) {
      await ensureTriggerBindingState({
        bindingName: getBindingName(actionDef),
        triggerId: actionDef.trigger,
        actionId: existingAction.id,
        bound: false,
        insertAfter,
      })
    }
    console.log('Stored Action code and versions preserved.')
    return
  }
  const script = await generateCode(actionDef, 'actions')

  const actionPayload = {
    name: actionDef.name,
    code: script,
    supported_triggers: [
      { id: actionDef.trigger, version: actionDef.triggerVersion },
    ],
    // Always include these dependencies and secrets to allow access to the Management API
    dependencies: [{ name: 'auth0', version: '4.7.0' }],
    secrets: [
      { name: 'AUTH0_DOMAIN', value: AUTH0_DOMAIN },
      { name: 'AUTH0_CLIENT_ID', value: AUTH0_CLIENT_ID },
      { name: 'AUTH0_CLIENT_SECRET', value: AUTH0_CLIENT_SECRET },
    ],
  }
  const updateEnabled = async (actionId: string) =>
    ensureTriggerBindingState({
      bindingName: getBindingName(actionDef),
      triggerId: actionDef.trigger,
      actionId,
      bound: actionDef.enabled,
      insertAfter,
    })

  const createOrUpdateAction = async () => {
    if (existingAction) {
      await auth0.actions.update({ id: existingAction.id }, actionPayload)
      console.log(`Action updated ${green(`\u2713`)}`)
      return existingAction.id
    } else {
      const createActionResponse = await auth0.actions.create(actionPayload)
      console.log(`Action created ${green(`\u2713`)}`)
      return createActionResponse.data.id
    }
  }
  const actionId = await createOrUpdateAction()

  // When there are dependencies, the action may not be ready to deploy immediately. Retry up to 5 times with a short delay.
  for (let i = 0; i < 5; i++) {
    try {
      await auth0.actions.deploy({ id: actionId })
      break
    } catch (e) {
      if (
        (e as { msg: string })?.msg !==
        "A draft must be in the 'built' state before it can be deployed."
      ) {
        console.error('Unexpected error, retrying after 1s: ', e)
      }
      if (i === 4) throw e
      await new Promise((resolve) => setTimeout(resolve, 1000))
    }
  }

  console.log(`New version deployed ${green(`\u2713`)}`)

  // If the desired final state is enabled, enable after updating and deploying
  if (actionDef.enabled) {
    await updateEnabled(actionId)
  }
}

export default async function run() {
  try {
    const actionManifest = getActionManifest()
    const liveActions = await getAllActions()
    for (let i = 0; i < actionManifest.length; i++) {
      const actionDef = actionManifest[i]
      console.log(`Updating action "${actionDef.name}":`)
      const insertAfter = actionManifest.slice(0, i).map(getBindingName)
      await deployAction({
        actionDef: actionDef,
        existingActions: liveActions,
        insertAfter,
      })
    }
  } catch (err) {
    console.error(red((err as Error).message))
    exit(1)
  }
}
