import {
  ApiResponse,
  Client,
  Connection,
  GetOrganizationMemberRoles200ResponseOneOfInner as Role,
  Rule,
} from 'auth0'
import { fs } from 'mz'
import path from 'path'
import auth0 from './client'
import prettier from 'prettier'
import { padEnd, truncate } from 'lodash'
import { cyan, green, grey, redBright, yellow } from 'chalk'
import { Change } from 'diff'

const RESULTS_PER_PAGE = 20
/** Paginate through an Auth0 record set */
export function paginateQuery<T>(
  method: ({
    page,
    per_page,
  }: {
    page: number
    per_page: number
  }) => Promise<ApiResponse<T[]>>
): (page?: number) => Promise<T[]> {
  const fn = async (page = 0): Promise<T[]> => {
    const res = await method({ page, per_page: RESULTS_PER_PAGE })
    const items = res.data // Assuming ApiResponse has a 'data' property containing the array
    if (items.length < RESULTS_PER_PAGE) {
      return items
    }
    return [...items, ...(await fn(page + 1))]
  }
  return fn
}

/** Recursively page through all rules on the Auth0 tenant */
export const getAllRules = paginateQuery<Rule>(
  auth0.rules.getAll.bind(auth0.rules)
)

/** Recursively page through all clients (applications) on the Auth0 tenant */
export const getAllClients = paginateQuery<Client>(
  auth0.clients.getAll.bind(auth0.clients)
)

/** Recursively page through all roles on the Auth0 tenant */
export const getAllRoles = paginateQuery<Role>(
  auth0.roles.getAll.bind(auth0.roles)
)

/** Recursively page through all connections on the Auth0 tenant */
export const getAllConnections = paginateQuery<Connection>(
  auth0.connections.getAll.bind(auth0.connections)
)

const AUTOGENERATED_COMMENT = `
  ${padEnd('//', 80, '/')}
  /**
   * THIS CODE IS AUTOMATICALLY GENERATED -
   * DON'T EDIT IT DIRECTLY!!!
   *
   * Instead, update it in the Auth0 Rules
   * repository and deploy your changes.
   */
  ${padEnd('//', 80, '/')}
`

export type CodeType = 'rules' | 'db' | 'login'

/** Generate the Auth0 code (rule, database script, login page) as a string */
export async function generateCode(
  ruleDef: RuleDefinition | DBActionScriptDefinition,
  /** Should match the directory name of the scripts */
  codeType: CodeType
) {
  const { file, getData } = ruleDef
  const data = getData ? await getData() : {}
  const filedata = await fs.readFile(
    path.join(__dirname, '../scripts', codeType, 'src', `${file}.js`)
  )
  const scriptBase = [
    AUTOGENERATED_COMMENT,
    filedata
      .toString()
      // remove the export that TS adds
      .replace(/^\s*export\s+\{\}.*$/m, '')
      .trim(),
  ].join('\n\n')

  // Inject template variables into the template if they exist
  const template = getData
    ? /**
       * It's not possible to add code outside of the single function in a rule
       * declaration, so we can't just prepend the data to the top of the file. This
       * injects our template data as the first line of the function
       */
      scriptBase.replace(
        /(function.*?\{\n)/m,
        `$1
        // Template data
        const TEMPLATE_DATA = ${formatData(data)}\n\n
        `
      )
    : scriptBase

  // format the template script
  return prettier.format(template, { parser: 'babel' })
}

/** Add nice coloured log output to log messages */
export function formatUpdateRuleMessage(ruleName: string, exists: boolean) {
  const action = exists ? yellow('(updating)') : green('(creating)')
  const msg = `${padEnd(
    `Rule ${cyan(truncate(ruleName, { length: 30 }))} ${
      exists ? `exists` : `doesnt exist`
    } `,
    60,
    '.'
  )}`
  const str = `${msg} ${action}`

  console.info(str)
}

type CommentValueBase = {
  value: string
  [x: string]: any
}

type CommentValue = CommentValueBase & {
  kind: 'commentValue'
}

/** Add a kind = commentValue prop to an object */
export function getCommentValue(data: CommentValueBase) {
  return {
    kind: 'commentValue',
    ...data,
  }
}

/** Check that an input is a `CommentValue` */
function isCommentValue(input: any): input is CommentValue {
  return (
    typeof input === 'object' &&
    typeof input.value !== 'undefined' &&
    input.kind === 'commentValue'
  )
}

/** Format template data for injection into a template */
export function formatData(data: Record<string, unknown>) {
  const output = []
  for (const key in data) {
    const value = data[key]
    /**
     * If our value is a `CommentValue` array, format it so that it ends up just
     * being an array of all the `values` props
     */
    if (Array.isArray(value) && value.every(isCommentValue)) {
      output.push([
        key,
        `${JSON.stringify(
          value.map(({ kind, ...rest }) => ({ ...rest }))
        )}.map(item => item.value)`,
      ])
    } else {
      output.push([key, JSON.stringify(value)])
    }
  }
  return `{
    ${output.map(([key, value]) => `${key}: ${value}`).join(',\n')}
  }`
}

/** Guard to assert that a Role has a name and id */
export function isValidRole(
  Role: Role
): Role is Role & { id: string; name: string } {
  return !!Role.name && !!Role.id
}

/** Guard to assert that a Client has a name and id */
export function isValidClient(
  Client: Client
): Client is Client & { client_id: string; name: string } {
  return !!Client.name && !!Client.client_id
}

/**
 * Compare two chunks of code and print the diff between them
 *
 * Takes codeType as a convenience parameter to enable nicer printing, but is
 * otherwise agnostic as to what it's diffing.
 */
export function printCodeDiff<
  T extends RuleDefinition | DBActionScriptDefinition | { name: string }
>(diffs: [T, Change[]][], codeType: CodeType): T[] {
  let changesHeaderPrinted = false
  const upToDateScripts: T[] = []
  for (const [scriptDef, changes] of diffs) {
    if (changes.every((part) => !(part.added || part.removed))) {
      upToDateScripts.push(scriptDef)
      continue
    }
    if (!changesHeaderPrinted) {
      console.log(`[[ Changed ${codeType} ]]`)
      changesHeaderPrinted = true
    }
    const lineDelimiter = padEnd('-', scriptDef.name.length + 3, '-')
    console.log(`- ${cyan(scriptDef.name)}:`)
    console.log(lineDelimiter)
    const firstCharRE = /^(.|\n)/gm
    for (const part of changes) {
      // add a space character to the beginning of unchanged lines to preserve
      // alignment when we add +/- chars
      const output = part.added
        ? green(part.value.replace(firstCharRE, '+$1'))
        : part.removed
        ? redBright(part.value.replace(firstCharRE, '-$1'))
        : grey(part.value.replace(firstCharRE, ' $1'))
      // we're writing character by character, so we do this by piping to
      // STDOUT directly rather than using console.log
      process.stderr.write(output)
    }
  }
  return upToDateScripts
}

type diffObject = { [key: string]: string | diffObject }

/**
 * Deep sorts an object of string values
 *
 * For example: deepSortObject({test: {x: 'value', a: 'other value'}})
 */
export function deepSortObject(obj: diffObject) {
  return Object.keys(obj)
    .sort()
    .reduce(function (result, key) {
      const x = obj[key]
      if (typeof x === 'object') {
        result[key] = deepSortObject(x)
      } else {
        result[key] = x
      }
      return result
    }, {} as diffObject)
}
