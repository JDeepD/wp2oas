import assert from 'node:assert/strict'
import test from 'node:test'
import { convertWordPressIndex, WordPressConversionError } from '../src/lib/converter.ts'
import type { WordPressRestIndex } from '../src/lib/wordpress.ts'

function indexWith(routes: WordPressRestIndex['routes']): WordPressRestIndex {
  return {
    name: 'Example site',
    description: 'Example routes',
    routes,
  }
}

test('converts named regex groups and infers numeric path parameters', () => {
  const result = convertWordPressIndex(
    indexWith({
      '/wp/v2/posts/(?P<id>[\\d]+)': {
        namespace: 'wp/v2',
        endpoints: [{ methods: ['GET'], args: null }],
      },
      '/wp/v2/items/(?P<parent>([^\\/:<>*?"|]+(?:\\/[^\\/:<>*?"|]+)?)[\\/\\w%-]+)': {
        namespace: 'wp/v2',
        methods: ['GET'],
        args: [],
      },
    }),
    'https://example.com/blog/wp-json/wp/v2',
  )

  assert.ok(result.spec.paths['/wp/v2/posts/{id}']?.get)
  assert.equal(
    result.spec.paths['/wp/v2/posts/{id}'].get?.parameters?.[0].schema.type,
    'integer',
  )
  assert.ok(result.spec.paths['/wp/v2/items/{parent}']?.get)
  assert.deepEqual(result.spec.servers, [{ url: 'https://example.com/blog/wp-json' }])
})

test('merges repeated endpoints per method deterministically', () => {
  const result = convertWordPressIndex(
    indexWith({
      '/wp/v2/posts': {
        namespace: 'wp/v2',
        args: { context: { type: 'string' } },
        endpoints: [
          { methods: ['GET'], args: { page: { type: 'integer' } } },
          { methods: ['GET'], args: { search: { type: 'string' } } },
          {
            methods: ['POST'],
            args: {
              title: { type: 'string', required: true },
              status: { type: 'string', enum: ['draft', 'publish'] },
            },
          },
        ],
      },
    }),
  )

  const path = result.spec.paths['/wp/v2/posts']
  assert.deepEqual(
    path.get?.parameters?.map(({ name }) => name),
    ['context', 'page', 'search'],
  )
  assert.deepEqual(
    path.post?.requestBody?.content['application/json'].schema.required,
    ['title'],
  )
  assert.equal(result.stats.operations, 2)
})

test('places arguments according to HTTP method semantics', () => {
  const result = convertWordPressIndex(
    indexWith({
      '/demo/v1/things/(?P<id>\\d+)': {
        namespace: 'demo/v1',
        args: {
          id: { type: 'integer', required: false },
          force: { type: 'boolean', required: true },
        },
        methods: ['GET', 'POST', 'DELETE', 'OPTIONS', 'HEAD'],
      },
    }),
  )
  const path = result.spec.paths['/demo/v1/things/{id}']

  for (const method of ['get', 'delete', 'options', 'head'] as const) {
    assert.equal(path[method]?.requestBody, undefined)
    assert.equal(path[method]?.parameters?.[0].required, true)
    assert.equal(path[method]?.parameters?.[1].name, 'force')
  }
  assert.equal(path.post?.parameters?.length, 1)
  assert.equal(path.post?.requestBody?.required, true)
})

test('maps supported schema constraints and warns instead of emitting invalid values', () => {
  const result = convertWordPressIndex(
    indexWith({
      '/demo/v1/search': {
        methods: ['GET'],
        args: {
          limit: {
            type: 'integer',
            default: 10,
            minimum: 1,
            maximum: 100,
          },
          term: {
            type: ['string', 'null'],
            minLength: 2,
            maxLength: 30,
            pattern: '[a-z]+',
            enum: ['one', 2],
          },
          broken: { type: 'mystery', minimum: 'low', pattern: '(' },
          ids: { type: 'array', items: { type: 'integer' } },
        },
      },
    }),
  )
  const parameters = result.spec.paths['/demo/v1/search'].get?.parameters ?? []
  const term = parameters.find(({ name }) => name === 'term')?.schema
  const ids = parameters.find(({ name }) => name === 'ids')?.schema

  assert.deepEqual(term?.enum, ['one'])
  assert.equal(term?.nullable, true)
  assert.equal(ids?.items?.type, 'integer')
  assert.ok(result.warnings.length >= 3)
})

test('skips invalid and unsupported routes while reporting accurate stats', () => {
  const result = convertWordPressIndex(
    indexWith({
      '/good/v1/items': { methods: ['GET', 'TRACE'] },
      '/broken/(?P<id>\\d+': { methods: ['GET'] },
      '/unsupported': { methods: ['CONNECT'] },
      '/invalid': null,
    }),
  )

  assert.deepEqual(result.stats, {
    wordpressRoutes: 4,
    openApiPaths: 1,
    operations: 1,
    skippedRoutes: 3,
  })
  assert.ok(result.warnings.some(({ code }) => code === 'unsupported-method'))
})

test('omits servers when no reliable URL is present', () => {
  const result = convertWordPressIndex(indexWith({ '/wp/v2': { methods: ['GET'] } }))
  assert.equal(result.spec.servers, undefined)
  assert.ok(result.warnings.some(({ code }) => code === 'missing-server'))
})

test('handles rest_route server URLs', () => {
  const result = convertWordPressIndex(
    indexWith({ '/wp/v2': { methods: ['GET'] } }),
    'https://example.com/blog/?rest_route=/',
  )
  assert.deepEqual(result.spec.servers, [
    { url: 'https://example.com/blog/?rest_route=' },
  ])
})

test('rejects indexes without usable routes', () => {
  assert.throws(
    () => convertWordPressIndex({ routes: {} }),
    WordPressConversionError,
  )
})
