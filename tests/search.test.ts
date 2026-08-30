import assert from 'node:assert/strict'
import test from 'node:test'
import { filterOpenApiDocument } from '../src/lib/search.ts'
import type { OpenAPIDocument } from '../src/lib/openapi.ts'

const spec: OpenAPIDocument = {
  openapi: '3.0.3',
  info: { title: 'Example', version: '1.0.0' },
  tags: [{ name: 'wp/v2' }, { name: 'custom/v1' }],
  paths: {
    '/wp/v2/posts': {
      get: {
        operationId: 'get_wp_v2_posts',
        tags: ['wp/v2'],
        responses: { '200': { description: 'Successful response' } },
      },
      post: {
        operationId: 'post_wp_v2_posts',
        tags: ['wp/v2'],
        responses: { '200': { description: 'Successful response' } },
      },
    },
    '/custom/v1/reports': {
      get: {
        operationId: 'get_custom_v1_reports',
        tags: ['custom/v1'],
        responses: { '200': { description: 'Successful response' } },
      },
    },
  },
}

test('returns every operation for an empty endpoint search', () => {
  const result = filterOpenApiDocument(spec, '  ')
  assert.equal(result.spec, spec)
  assert.equal(result.operations, 3)
})

test('searches endpoint paths and methods with multiple terms', () => {
  const result = filterOpenApiDocument(spec, 'POST posts')
  assert.equal(result.operations, 1)
  assert.ok(result.spec.paths['/wp/v2/posts']?.post)
  assert.equal(result.spec.paths['/wp/v2/posts']?.get, undefined)
})

test('searches operation IDs and namespace tags', () => {
  const byId = filterOpenApiDocument(spec, 'custom reports')
  assert.equal(byId.operations, 1)
  assert.ok(byId.spec.paths['/custom/v1/reports']?.get)
  assert.deepEqual(byId.spec.tags, [{ name: 'custom/v1' }])

  const noMatches = filterOpenApiDocument(spec, 'missing')
  assert.equal(noMatches.operations, 0)
  assert.deepEqual(noMatches.spec.paths, {})
})

test('treats hash-prefixed searches as exact namespace sections', () => {
  const result = filterOpenApiDocument(spec, '#wp/v2')
  assert.equal(result.operations, 2)
  assert.deepEqual(Object.keys(result.spec.paths), ['/wp/v2/posts'])

  const partialSection = filterOpenApiDocument(spec, '#wp')
  assert.equal(partialSection.operations, 0)
})
