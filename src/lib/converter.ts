import type {
  JsonValue,
  OpenAPIDocument,
  OpenAPIHttpMethod,
  OpenAPIOperation,
  OpenAPIParameter,
  OpenAPIPathItem,
  OpenAPISchema,
} from './openapi.ts'
import type {
  WordPressArgument,
  WordPressEndpoint,
  WordPressRestIndex,
  WordPressRoute,
} from './wordpress.ts'

const SUPPORTED_METHODS = new Set<OpenAPIHttpMethod>([
  'get',
  'post',
  'put',
  'patch',
  'delete',
  'options',
  'head',
])

const BODY_METHODS = new Set<OpenAPIHttpMethod>(['post', 'put', 'patch'])
const UNSAFE_PCRE_TOKENS = /\(\?[A-Z<]|\(\?>|\(\?\(|\\[AzZKG]|\+\+|\*\+|\?\+/

export interface ConversionWarning {
  code:
    | 'invalid-route'
    | 'path-collision'
    | 'unsupported-method'
    | 'invalid-argument'
    | 'unsupported-schema'
    | 'unsafe-pattern'
    | 'missing-server'
  message: string
  route?: string
  method?: string
  argument?: string
}

export interface ConversionStats {
  wordpressRoutes: number
  openApiPaths: number
  operations: number
  skippedRoutes: number
}

export interface ConversionResult {
  spec: OpenAPIDocument
  warnings: ConversionWarning[]
  stats: ConversionStats
}

export class WordPressConversionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'WordPressConversionError'
  }
}

interface RouteParameter {
  name: string
  pattern: string
}

interface ConvertedRoute {
  path: string
  parameters: RouteParameter[]
}

interface OperationSeed {
  args: Record<string, WordPressArgument>
  namespace: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asNonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function getMethods(value: unknown): string[] {
  const methods = Array.isArray(value) ? value : [value]
  return methods
    .filter((method): method is string => typeof method === 'string')
    .flatMap((method) => method.split(','))
    .map((method) => method.trim().toLowerCase())
    .filter(Boolean)
}

function getArguments(
  value: unknown,
  warnings: ConversionWarning[],
  route: string,
): Record<string, WordPressArgument> {
  if (value === undefined || value === null || Array.isArray(value)) return {}
  if (!isRecord(value)) {
    warnings.push({
      code: 'invalid-argument',
      message: 'An invalid arguments collection was ignored.',
      route,
    })
    return {}
  }

  const argumentsByName: Record<string, WordPressArgument> = {}
  for (const [name, definition] of Object.entries(value)) {
    if (isRecord(definition)) {
      argumentsByName[name] = definition
    } else {
      warnings.push({
        code: 'invalid-argument',
        message: `The definition for argument “${name}” was ignored.`,
        route,
        argument: name,
      })
    }
  }
  return argumentsByName
}

function parseNamedGroup(
  route: string,
  start: number,
): { end: number; name: string; pattern: string } | undefined {
  const nameStart = start + 4
  const nameEnd = route.indexOf('>', nameStart)
  if (nameEnd === -1) return undefined

  const name = route.slice(nameStart, nameEnd)
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) return undefined

  let depth = 1
  let inCharacterClass = false
  let escaped = false

  for (let index = nameEnd + 1; index < route.length; index += 1) {
    const character = route[index]
    if (escaped) {
      escaped = false
      continue
    }
    if (character === '\\') {
      escaped = true
      continue
    }
    if (character === '[') inCharacterClass = true
    if (character === ']') inCharacterClass = false
    if (inCharacterClass) continue
    if (character === '(') depth += 1
    if (character === ')') depth -= 1

    if (depth === 0) {
      return {
        end: index + 1,
        name,
        pattern: route.slice(nameEnd + 1, index),
      }
    }
  }

  return undefined
}

function convertRoutePath(rawRoute: string): ConvertedRoute | undefined {
  if (!rawRoute.trim()) return undefined

  let path = ''
  const parameters: RouteParameter[] = []

  for (let index = 0; index < rawRoute.length; ) {
    if (rawRoute.startsWith('(?P<', index)) {
      const group = parseNamedGroup(rawRoute, index)
      if (!group) return undefined
      path += `{${group.name}}`
      parameters.push({ name: group.name, pattern: group.pattern })
      index = group.end
      continue
    }

    path += rawRoute[index]
    index += 1
  }

  path = path.replaceAll('\\/', '/').replace(/^\^/, '').replace(/\$$/, '')
  path = path.replace(/\/{2,}/g, '/')
  if (!path.startsWith('/')) path = `/${path}`
  if (path.length > 1) path = path.replace(/\/+$/, '')

  const outsidePlaceholders = path.replace(/\{[A-Za-z_][A-Za-z0-9_]*\}/g, '')
  if (/[()[\]^$+*?|\\]/.test(outsidePlaceholders)) return undefined

  const uniqueNames = new Set(parameters.map(({ name }) => name))
  if (uniqueNames.size !== parameters.length) return undefined

  return { path, parameters }
}

function normalizeRoutePattern(pattern: string): string {
  return pattern.replaceAll('\\/', '/').replace(/^\^/, '').replace(/\$$/, '')
}

function routeSchemaPattern(pattern: string): string {
  return `^(?:${normalizeRoutePattern(pattern)})$`
}

function isClearlyIntegerPattern(pattern: string): boolean {
  const normalized = normalizeRoutePattern(pattern).replace(/^\(\?:/, '').replace(/\)$/, '')
  return /^(?:\\d\+|\[\\d\]\+|\[0-9\]\+|\\d\{\d+,?\d*\}|\[0-9\]\{\d+,?\d*\})$/.test(
    normalized,
  )
}

function isSafePattern(pattern: string): boolean {
  if (!pattern || UNSAFE_PCRE_TOKENS.test(pattern)) return false
  try {
    new RegExp(`^(?:${normalizeRoutePattern(pattern)})$`)
    return true
  } catch {
    return false
  }
}

function jsonValue(value: unknown): JsonValue | undefined {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  ) {
    return value
  }
  if (Array.isArray(value)) {
    const converted = value.map(jsonValue)
    return converted.every((item) => item !== undefined)
      ? (converted as JsonValue[])
      : undefined
  }
  if (isRecord(value)) {
    const converted: Record<string, JsonValue> = {}
    for (const [key, item] of Object.entries(value)) {
      const child = jsonValue(item)
      if (child === undefined) return undefined
      converted[key] = child
    }
    return converted
  }
  return undefined
}

function valueMatchesType(value: JsonValue, type: OpenAPISchema['type']): boolean {
  if (!type || value === null) return true
  if (type === 'integer') return typeof value === 'number' && Number.isInteger(value)
  if (type === 'number') return typeof value === 'number'
  if (type === 'array') return Array.isArray(value)
  if (type === 'object') return isRecord(value)
  return typeof value === type
}

function schemaWarning(
  warnings: ConversionWarning[],
  message: string,
  context: Pick<ConversionWarning, 'route' | 'method' | 'argument'>,
): void {
  warnings.push({ code: 'unsupported-schema', message, ...context })
}

function schemaAllowsType(
  schema: OpenAPISchema,
  allowedTypes: Array<NonNullable<OpenAPISchema['type']>>,
): boolean {
  if (schema.type) return allowedTypes.includes(schema.type)
  if (schema.oneOf) {
    return schema.oneOf.some(({ type }) => type && allowedTypes.includes(type))
  }
  return true
}

function buildSchema(
  definition: WordPressArgument,
  warnings: ConversionWarning[],
  context: Pick<ConversionWarning, 'route' | 'method' | 'argument'>,
): OpenAPISchema {
  const schema: OpenAPISchema = {}
  const rawTypes = Array.isArray(definition.type)
    ? definition.type.filter((type): type is string => typeof type === 'string')
    : typeof definition.type === 'string'
      ? [definition.type]
      : []
  const nullable = rawTypes.includes('null')
  const supportedTypes = [...new Set(rawTypes.filter((type) => type !== 'null'))]
  const recognizedTypes = supportedTypes.filter((type) =>
    ['string', 'integer', 'number', 'boolean', 'array', 'object'].includes(type),
  ) as OpenAPISchema['type'][]

  if (supportedTypes.length !== recognizedTypes.length) {
    schemaWarning(
      warnings,
      `Unsupported argument type ${JSON.stringify(definition.type)} was omitted.`,
      context,
    )
  }
  if (recognizedTypes.length === 1) schema.type = recognizedTypes[0]
  if (recognizedTypes.length > 1) {
    schema.oneOf = recognizedTypes.map((type) => ({ type }))
  }
  if (nullable || rawTypes.length === 1 && rawTypes[0] === 'null') {
    schema.nullable = true
  }
  if (rawTypes.length === 1 && rawTypes[0] === 'null') {
    schemaWarning(
      warnings,
      'A null-only type cannot be represented exactly in OpenAPI 3.0 and was left unconstrained and nullable.',
      context,
    )
  }

  const description = asNonEmptyString(definition.description)
  if (description) schema.description = description

  const format = asNonEmptyString(definition.format)
  if (format && (!schema.type || schema.type === 'string' || schema.type === 'number' || schema.type === 'integer')) {
    schema.format = format
  } else if (definition.format !== undefined) {
    schemaWarning(warnings, 'An invalid schema format was omitted.', context)
  }

  const defaultValue = jsonValue(definition.default)
  if (definition.default !== undefined) {
    if (defaultValue !== undefined && valueMatchesType(defaultValue, schema.type)) {
      schema.default = defaultValue
    } else {
      schemaWarning(warnings, 'A default value that did not match the schema was omitted.', context)
    }
  }

  if (definition.enum !== undefined) {
    if (Array.isArray(definition.enum)) {
      const enumValues = definition.enum
        .map(jsonValue)
        .filter((value): value is JsonValue => value !== undefined)
        .filter((value) => valueMatchesType(value, schema.type))
      if (enumValues.length) schema.enum = enumValues
      if (enumValues.length !== definition.enum.length || !enumValues.length) {
        schemaWarning(warnings, 'Invalid enum values were omitted.', context)
      }
    } else {
      schemaWarning(warnings, 'A non-array enum was omitted.', context)
    }
  }

  for (const key of ['minimum', 'maximum'] as const) {
    const value = definition[key]
    if (value === undefined) continue
    if (
      typeof value === 'number' &&
      Number.isFinite(value) &&
      schemaAllowsType(schema, ['integer', 'number'])
    ) schema[key] = value
    else schemaWarning(warnings, `Invalid ${key} value was omitted.`, context)
  }

  for (const key of ['minLength', 'maxLength'] as const) {
    const value = definition[key]
    if (value === undefined) continue
    if (
      Number.isInteger(value) &&
      (value as number) >= 0 &&
      schemaAllowsType(schema, ['string'])
    ) schema[key] = value as number
    else schemaWarning(warnings, `Invalid ${key} value was omitted.`, context)
  }

  if (definition.pattern !== undefined) {
    if (
      typeof definition.pattern === 'string' &&
      isSafePattern(definition.pattern) &&
      schemaAllowsType(schema, ['string'])
    ) {
      schema.pattern = definition.pattern.replaceAll('\\/', '/')
    } else {
      warnings.push({
        code: 'unsafe-pattern',
        message: 'A pattern that is not safely representable in OpenAPI was omitted.',
        ...context,
      })
    }
  }

  if (definition.items !== undefined && !schema.type && !schema.oneOf) {
    schema.type = 'array'
  }
  if (schemaAllowsType(schema, ['array']) && (schema.type === 'array' || definition.items !== undefined)) {
    if (isRecord(definition.items)) {
      schema.items = buildSchema(definition.items, warnings, context)
    } else {
      schema.items = {}
      if (definition.items !== undefined) {
        schemaWarning(warnings, 'Invalid array items were replaced with an unconstrained schema.', context)
      }
    }
  } else if (definition.items !== undefined) {
    schemaWarning(warnings, 'Array items on a non-array schema were omitted.', context)
  }

  if (isRecord(definition.properties) && !schema.type && !schema.oneOf) {
    schema.type = 'object'
  }
  if (schemaAllowsType(schema, ['object']) && isRecord(definition.properties)) {
    const properties: Record<string, OpenAPISchema> = {}
    for (const [name, property] of Object.entries(definition.properties)) {
      if (!isRecord(property)) continue
      properties[name] = buildSchema(property, warnings, {
        ...context,
        argument: context.argument ? `${context.argument}.${name}` : name,
      })
    }
    if (Object.keys(properties).length) schema.properties = properties

    if (Array.isArray(definition.required)) {
      const required = definition.required.filter(
        (name): name is string => typeof name === 'string' && name in properties,
      )
      if (required.length) schema.required = [...new Set(required)].sort()
    }
  }

  if (definition.additionalProperties !== undefined && schema.type === 'object') {
    if (typeof definition.additionalProperties === 'boolean') {
      schema.additionalProperties = definition.additionalProperties
    } else if (isRecord(definition.additionalProperties)) {
      schema.additionalProperties = buildSchema(
        definition.additionalProperties,
        warnings,
        context,
      )
    } else {
      schemaWarning(warnings, 'Invalid additionalProperties value was omitted.', context)
    }
  }

  return schema
}

function pathParameterSchema(
  parameter: RouteParameter,
  definition: WordPressArgument | undefined,
  warnings: ConversionWarning[],
  context: Pick<ConversionWarning, 'route' | 'method' | 'argument'>,
): OpenAPISchema {
  const schema = definition ? buildSchema(definition, warnings, context) : {}
  if (isClearlyIntegerPattern(parameter.pattern)) {
    schema.type = 'integer'
    delete schema.pattern
    delete schema.oneOf
    return schema
  }

  if (!schema.type) schema.type = 'string'
  if (schema.type === 'string' && isSafePattern(parameter.pattern)) {
    schema.pattern = routeSchemaPattern(parameter.pattern)
  } else if (parameter.pattern) {
    warnings.push({
      code: 'unsafe-pattern',
      message: `The route pattern for “${parameter.name}” could not be represented safely with its inferred type.`,
      ...context,
    })
  }
  return schema
}

function operationId(method: OpenAPIHttpMethod, path: string): string {
  const pathPart = path
    .replace(/[{}]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase()
  return `${method}_${pathPart || 'root'}`
}

function buildOperation(
  method: OpenAPIHttpMethod,
  path: string,
  parameters: RouteParameter[],
  seed: OperationSeed,
  warnings: ConversionWarning[],
): OpenAPIOperation {
  const operationParameters: OpenAPIParameter[] = parameters.map((parameter) => {
    const definition = seed.args[parameter.name]
    const description = asNonEmptyString(definition?.description)

    return {
      name: parameter.name,
      in: 'path',
      required: true,
      ...(description ? { description } : {}),
      schema: pathParameterSchema(parameter, definition, warnings, {
        route: path,
        method: method.toUpperCase(),
        argument: parameter.name,
      }),
    }
  })
  const pathNames = new Set(parameters.map(({ name }) => name))
  const bodyProperties: Record<string, OpenAPISchema> = {}
  const bodyRequired: string[] = []

  for (const name of Object.keys(seed.args).sort()) {
    if (pathNames.has(name)) continue
    const definition = seed.args[name]
    const schema = buildSchema(definition, warnings, {
      route: path,
      method: method.toUpperCase(),
      argument: name,
    })

    if (BODY_METHODS.has(method)) {
      bodyProperties[name] = schema
      if (definition.required === true) bodyRequired.push(name)
    } else {
      operationParameters.push({
        name,
        in: 'query',
        required: definition.required === true,
        ...(asNonEmptyString(definition.description)
          ? { description: asNonEmptyString(definition.description) }
          : {}),
        schema,
      })
    }
  }

  const operation: OpenAPIOperation = {
    operationId: operationId(method, path),
    ...(seed.namespace ? { tags: [seed.namespace] } : {}),
    ...(operationParameters.length ? { parameters: operationParameters } : {}),
    responses: { '200': { description: 'Successful response' } },
  }

  if (BODY_METHODS.has(method) && Object.keys(bodyProperties).length) {
    operation.requestBody = {
      required: bodyRequired.length > 0,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: bodyProperties,
            ...(bodyRequired.length ? { required: bodyRequired.sort() } : {}),
          },
        },
      },
    }
  }

  return operation
}

function namespaceForRoute(route: WordPressRoute, path: string): string {
  const explicit = asNonEmptyString(route.namespace)
  if (explicit) return explicit
  const segments = path.split('/').filter(Boolean)
  return segments.slice(0, 2).join('/')
}

function collectOperationSeeds(
  route: WordPressRoute,
  path: string,
  warnings: ConversionWarning[],
): Map<OpenAPIHttpMethod, OperationSeed> {
  const seeds = new Map<OpenAPIHttpMethod, OperationSeed>()
  const routeArguments = getArguments(route.args, warnings, path)
  const routeMethods = getMethods(route.methods)
  const endpointValues = Array.isArray(route.endpoints) ? route.endpoints : []
  const endpoints = endpointValues.filter(
    (endpoint): endpoint is WordPressEndpoint => isRecord(endpoint),
  )
  if (endpoints.length !== endpointValues.length) {
    warnings.push({
      code: 'invalid-route',
      message: 'One or more invalid endpoint definitions were ignored.',
      route: path,
    })
  }
  const definitions = endpoints.length ? endpoints : [{ methods: route.methods, args: route.args }]

  for (const endpoint of definitions) {
    const methods = getMethods(endpoint.methods)
    const effectiveMethods = methods.length ? methods : routeMethods
    const endpointArguments = getArguments(endpoint.args, warnings, path)
    for (const rawMethod of effectiveMethods) {
      if (!SUPPORTED_METHODS.has(rawMethod as OpenAPIHttpMethod)) {
        warnings.push({
          code: 'unsupported-method',
          message: `Unsupported HTTP method “${rawMethod.toUpperCase()}” was skipped.`,
          route: path,
          method: rawMethod.toUpperCase(),
        })
        continue
      }

      const method = rawMethod as OpenAPIHttpMethod
      const existing = seeds.get(method)
      seeds.set(method, {
        args: {
          ...routeArguments,
          ...existing?.args,
          ...endpointArguments,
        },
        namespace: namespaceForRoute(route, path),
      })
    }
  }

  return seeds
}

function normalizeServerCandidate(candidate: string): string | undefined {
  try {
    const url = new URL(candidate)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined
    url.hash = ''

    if (url.searchParams.has('rest_route')) {
      url.search = '?rest_route='
      return url.toString().replace(/\/$/, '')
    }

    const marker = '/wp-json'
    const markerIndex = url.pathname.indexOf(marker)
    if (markerIndex >= 0) {
      url.pathname = url.pathname.slice(0, markerIndex + marker.length)
    } else {
      url.pathname = `${url.pathname.replace(/\/+$/, '')}${marker}`
    }
    url.search = ''
    return url.toString().replace(/\/$/, '')
  } catch {
    return undefined
  }
}

function deriveServerUrl(
  index: WordPressRestIndex,
  sourceUrl: string | undefined,
): string | undefined {
  const links = isRecord(index._links) ? index._links : undefined
  const selfLinks = links && Array.isArray(links.self) ? links.self : []
  const selfHref = selfLinks.find((link) => isRecord(link) && asNonEmptyString(link.href))
  const candidates = [
    sourceUrl,
    isRecord(selfHref) ? asNonEmptyString(selfHref.href) : undefined,
    asNonEmptyString(index.url),
    asNonEmptyString(index.home),
  ]

  for (const candidate of candidates) {
    if (!candidate) continue
    const serverUrl = normalizeServerCandidate(candidate)
    if (serverUrl) return serverUrl
  }
  return undefined
}

function ensureUniqueOperationIds(paths: Record<string, OpenAPIPathItem>): void {
  const used = new Set<string>()
  for (const path of Object.keys(paths).sort()) {
    const pathItem = paths[path]
    for (const method of [...SUPPORTED_METHODS].sort()) {
      const operation = pathItem[method]
      if (!operation) continue
      const base = operation.operationId
      let unique = base
      let suffix = 2
      while (used.has(unique)) {
        unique = `${base}_${suffix}`
        suffix += 1
      }
      operation.operationId = unique
      used.add(unique)
    }
  }
}

export function convertWordPressIndex(
  index: WordPressRestIndex,
  sourceUrl?: string,
): ConversionResult {
  if (!isRecord(index)) {
    throw new WordPressConversionError('The WordPress REST index must be an object.')
  }
  if (!isRecord(index.routes)) {
    throw new WordPressConversionError('The WordPress REST index does not contain a routes object.')
  }

  const routeEntries = Object.entries(index.routes).sort(([left], [right]) =>
    left.localeCompare(right),
  )
  if (!routeEntries.length) {
    throw new WordPressConversionError('The WordPress REST index contains no routes.')
  }

  const warnings: ConversionWarning[] = []
  const paths: Record<string, OpenAPIPathItem> = {}
  let skippedRoutes = 0

  for (const [rawPath, rawRoute] of routeEntries) {
    if (!isRecord(rawRoute)) {
      skippedRoutes += 1
      warnings.push({
        code: 'invalid-route',
        message: 'A route with an invalid definition was skipped.',
        route: rawPath,
      })
      continue
    }

    const converted = convertRoutePath(rawPath)
    if (!converted) {
      skippedRoutes += 1
      warnings.push({
        code: 'invalid-route',
        message: 'A route pattern that cannot be represented as an OpenAPI path was skipped.',
        route: rawPath,
      })
      continue
    }

    const seeds = collectOperationSeeds(rawRoute, converted.path, warnings)
    if (!seeds.size) {
      skippedRoutes += 1
      warnings.push({
        code: 'invalid-route',
        message: 'A route with no supported HTTP methods was skipped.',
        route: rawPath,
      })
      continue
    }

    if (paths[converted.path] && rawPath !== converted.path) {
      warnings.push({
        code: 'path-collision',
        message: 'Multiple WordPress route patterns resolve to the same OpenAPI path and were merged.',
        route: rawPath,
      })
    }
    const pathItem = paths[converted.path] ?? {}
    for (const method of [...seeds.keys()].sort()) {
      const seed = seeds.get(method)
      if (!seed) continue
      pathItem[method] = buildOperation(
        method,
        converted.path,
        converted.parameters,
        seed,
        warnings,
      )
    }
    paths[converted.path] = pathItem
  }

  if (!Object.keys(paths).length) {
    throw new WordPressConversionError('No supported WordPress routes could be converted.')
  }

  ensureUniqueOperationIds(paths)
  const operations = Object.values(paths).reduce(
    (total, pathItem) => total + Object.keys(pathItem).length,
    0,
  )
  const serverUrl = deriveServerUrl(index, sourceUrl)
  if (!serverUrl) {
    warnings.push({
      code: 'missing-server',
      message: 'No reliable WordPress REST server URL was available, so servers was omitted.',
    })
  }

  const title = asNonEmptyString(index.name) ?? 'WordPress REST API'
  const description = asNonEmptyString(index.description)
  const tags = [
    ...new Set(
      Object.values(paths).flatMap((pathItem) =>
        Object.values(pathItem).flatMap((operation) => operation?.tags ?? []),
      ),
    ),
  ]
    .sort()
    .map((name) => ({ name }))

  return {
    spec: {
      openapi: '3.0.3',
      info: {
        title,
        ...(description ? { description } : {}),
        version: '1.0.0',
      },
      ...(serverUrl ? { servers: [{ url: serverUrl }] } : {}),
      ...(tags.length ? { tags } : {}),
      paths,
    },
    warnings,
    stats: {
      wordpressRoutes: routeEntries.length,
      openApiPaths: Object.keys(paths).length,
      operations,
      skippedRoutes,
    },
  }
}
