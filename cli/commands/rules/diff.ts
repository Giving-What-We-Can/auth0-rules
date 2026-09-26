import { generateCode, getAllRules, printCodeDiff } from '../../lib/utils'
import { Change, diffLines } from 'diff'
import { RULE_MANIFEST, getLoginTenant } from '../../manifests'
import { Rule } from 'auth0'
import { cyan, green, grey, magenta, red } from 'chalk'

type DiffPair = [RuleDefinition, Rule | undefined]

export default async function run() {
  getLoginTenant()
  const Rules = await getAllRules()
  // Match rules in the manifest to existing Auth0 rules
  const matches: DiffPair[] = RULE_MANIFEST.map((ruleDef) => [
    ruleDef,
    Rules.find((Rule) => ruleDef.name === Rule.name),
  ])
  // Rules that exist on Auth0 but are not defined in the manifest
  const extras: Rule[] = Rules.filter((Rule) =>
    RULE_MANIFEST.every((ruleDef) => ruleDef.name !== Rule.name)
  )
  const diffs: [RuleDefinition, Change[]][] = []
  const missingRules: RuleDefinition[] = []
  // generate the diffs
  for (const [ruleDef, Rule] of matches) {
    if (!ruleDef.enabled) {
      console.log(
        `- ${ruleDef.name}: ${
          Rule?.enabled
            ? 'enabled -> disabled'
            : 'disabled or absent (unchanged)'
        }`
      )
      continue
    }
    if (!Rule?.script) {
      missingRules.push(ruleDef)
      continue
    }
    const script = await generateCode(ruleDef, 'rules')
    diffs.push([ruleDef, diffLines(Rule.script, script)])
  }
  // print the diffs
  const upToDateRules = printCodeDiff(diffs, 'rules')
  if (upToDateRules.length) {
    console.log(`\n[[ Up-to-date rules ]]`)
    console.log(
      grey(
        `${
          upToDateRules.length === RULE_MANIFEST.length
            ? 'All'
            : upToDateRules.length
        } rules defined in the manifest are identical to those that exist on the Auth0 tenant:`
      )
    )
    console.log(
      `${upToDateRules.map((Rule) => `- ${cyan(Rule.name)}`).join('\n')}`
    )
  }

  if (missingRules.length) {
    console.log(`\n[[ Missing rules ]]`)
    console.log(
      grey(
        `${missingRules.length} rules defined in the manifest do not exist on the Auth0 tenant:`
      )
    )
    console.log(
      `${missingRules.map((Rule) => `- ${magenta(Rule.name)}`).join('\n')}`
    )
  }

  if (extras.length) {
    console.log(`\n[[ Extra rules ]]`)
    console.log(
      grey(
        `${extras.length} rules exist on the Auth0 tenant that are not included in the manifest:`
      )
    )
    console.log(`${extras.map((Rule) => `- ${magenta(Rule.name)}`).join('\n')}`)
  }
}
