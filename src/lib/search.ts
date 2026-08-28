import type {
  OpenAPIDocument,
  OpenAPIHttpMethod,
  OpenAPIPathItem,
} from './openapi.ts'

const HTTP_METHODS: OpenAPIHttpMethod[] = [
  'get',
  'post',
  'put',
  'patch',
  'delete',
  'options',
  'head',
]

export interface EndpointSearchResult {
  spec: OpenAPIDocument
  operations: number
}

function operationCount(spec: OpenAPIDocument): number {
  return Object.values(spec.paths).reduce(
    (total, pathItem) =>
      total + HTTP_METHODS.filter((method) => pathItem[method]).length,
    0,
  )
}

export function filterOpenApiDocument(
  spec: OpenAPIDocument,
  query: string,
): EndpointSearchResult {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (!terms.length) return { spec, operations: operationCount(spec) }

  const paths: Record<string, OpenAPIPathItem> = {}
  const usedTags = new Set<string>()
  let operations = 0

  for (const [path, pathItem] of Object.entries(spec.paths)) {
    const matchingOperations: OpenAPIPathItem = {}

    for (const method of HTTP_METHODS) {
      const operation = pathItem[method]
      if (!operation) continue

      const searchText = [
        method,
        path,
        operation.operationId,
        operation.summary,
        ...(operation.tags ?? []),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()

      const matches = terms.every((term) =>
        HTTP_METHODS.includes(term as OpenAPIHttpMethod)
          ? method === term
          : searchText.includes(term),
      )
      if (!matches) continue
      matchingOperations[method] = operation
      operation.tags?.forEach((tag) => usedTags.add(tag))
      operations += 1
    }

    if (Object.keys(matchingOperations).length) paths[path] = matchingOperations
  }

  return {
    spec: {
      ...spec,
      paths,
      ...(spec.tags
        ? { tags: spec.tags.filter(({ name }) => usedTags.has(name)) }
        : {}),
    },
    operations,
  }
}
