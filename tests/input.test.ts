import assert from 'node:assert/strict'
import test from 'node:test'
import {
  fetchWordPressIndex,
  normalizeWordPressUrl,
  parseWordPressIndexJson,
  readWordPressIndexFile,
  WordPressInputError,
} from '../src/lib/input.ts'

const VALID_INDEX = JSON.stringify({
  name: 'Example',
  routes: { '/wp/v2/posts': { namespace: 'wp/v2', methods: ['GET'] } },
})

test('normalizes site, wp-json, subdirectory, and rest_route URLs', () => {
  assert.equal(normalizeWordPressUrl('example.com'), 'https://example.com/wp-json')
  assert.equal(
    normalizeWordPressUrl('https://example.com/blog/'),
    'https://example.com/blog/wp-json',
  )
  assert.equal(
    normalizeWordPressUrl('https://example.com/blog/wp-json/wp/v2/posts?x=1'),
    'https://example.com/blog/wp-json',
  )
  assert.equal(
    normalizeWordPressUrl('https://example.com/blog/?rest_route=/wp/v2'),
    'https://example.com/blog/?rest_route=%2F',
  )
})

test('rejects unsupported schemes and embedded credentials', () => {
  assert.throws(
    () => normalizeWordPressUrl('ftp://example.com'),
    (error: unknown) =>
      error instanceof WordPressInputError && error.code === 'unsupported-protocol',
  )
  assert.throws(
    () => normalizeWordPressUrl('https://user:secret@example.com'),
    (error: unknown) =>
      error instanceof WordPressInputError && error.code === 'invalid-url',
  )
})

test('parses BOM-prefixed JSON and validates WordPress shape', () => {
  assert.equal(parseWordPressIndexJson(`\uFEFF${VALID_INDEX}`).name, 'Example')
  assert.throws(
    () => parseWordPressIndexJson('{bad json'),
    (error: unknown) =>
      error instanceof WordPressInputError && error.code === 'invalid-json',
  )
  assert.throws(
    () => parseWordPressIndexJson('{"routes":{}}'),
    (error: unknown) =>
      error instanceof WordPressInputError && error.code === 'empty-routes',
  )
  assert.throws(
    () => parseWordPressIndexJson('{"routes":{"thing":{}}}'),
    (error: unknown) =>
      error instanceof WordPressInputError && error.code === 'invalid-schema',
  )
})

test('enforces the file size limit before reading', async () => {
  let read = false
  await assert.rejects(
    readWordPressIndexFile(
      {
        size: 11,
        async text() {
          read = true
          return VALID_INDEX
        },
      },
      10,
    ),
    (error: unknown) =>
      error instanceof WordPressInputError && error.code === 'file-too-large',
  )
  assert.equal(read, false)
})

test('fetches and parses a WordPress index without credentials', async () => {
  let requestInit: RequestInit | undefined
  const fetchImpl: typeof fetch = async (_input, init) => {
    requestInit = init
    return new Response(VALID_INDEX, {
      headers: { 'content-type': 'application/json' },
    })
  }
  const index = await fetchWordPressIndex('https://example.com/wp-json', {
    fetchImpl,
    pageProtocol: 'https:',
  })

  assert.equal(index.name, 'Example')
  assert.ok(requestInit)
  assert.equal(requestInit.credentials, 'omit')
  assert.equal((requestInit.headers as Record<string, string>).Accept, 'application/json')
})

test('classifies mixed content and non-JSON responses', async () => {
  await assert.rejects(
    fetchWordPressIndex('http://example.com/wp-json', { pageProtocol: 'https:' }),
    (error: unknown) =>
      error instanceof WordPressInputError && error.code === 'mixed-content',
  )
  await assert.rejects(
    fetchWordPressIndex('https://example.com/wp-json', {
      fetchImpl: async () =>
        new Response('<html>Not WordPress</html>', {
          headers: { 'content-type': 'text/html' },
        }),
    }),
    (error: unknown) =>
      error instanceof WordPressInputError && error.code === 'non-json-response',
  )
})

test('classifies network failure, timeout, and caller cancellation', async () => {
  await assert.rejects(
    fetchWordPressIndex('https://example.com/wp-json', {
      fetchImpl: async () => {
        throw new TypeError('Failed to fetch')
      },
    }),
    (error: unknown) =>
      error instanceof WordPressInputError && error.code === 'network-failure',
  )

  const pendingFetch: typeof fetch = async (_input, init) =>
    new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () =>
        reject(new DOMException('Aborted', 'AbortError')),
      )
    })
  await assert.rejects(
    fetchWordPressIndex('https://example.com/wp-json', {
      fetchImpl: pendingFetch,
      timeoutMs: 1,
    }),
    (error: unknown) =>
      error instanceof WordPressInputError && error.code === 'timeout',
  )

  const controller = new AbortController()
  const request = fetchWordPressIndex('https://example.com/wp-json', {
    fetchImpl: pendingFetch,
    signal: controller.signal,
  })
  controller.abort()
  await assert.rejects(
    request,
    (error: unknown) =>
      error instanceof WordPressInputError && error.code === 'aborted',
  )
})
