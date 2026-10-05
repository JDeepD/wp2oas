import assert from 'node:assert/strict'
import test from 'node:test'
import { convertWordPressIndex } from '../src/lib/converter.ts'
import { createShareableUrl, readSharedSourceUrl } from '../src/lib/share.ts'
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
  let requests = 0
  let requestInit: RequestInit | undefined
  const fetchImpl: typeof fetch = async (_input, init) => {
    requests += 1
    requestInit = init
    return new Response(VALID_INDEX, {
      headers: { 'content-type': 'application/json' },
    })
  }
  const { index, sourceUrl } = await fetchWordPressIndex('https://example.com/wp-json', {
    fetchImpl,
    pageProtocol: 'https:',
  })

  assert.equal(index.name, 'Example')
  assert.equal(sourceUrl, 'https://example.com/wp-json')
  assert.equal(requests, 1)
  assert.ok(requestInit)
  assert.equal(requestInit.credentials, 'omit')
  assert.equal((requestInit.headers as Record<string, string>).Accept, 'application/json')
})

test('retries a failed bare-domain request with www and uses that source in conversions and links', async () => {
  const requests: string[] = []
  const signals: Array<AbortSignal | null | undefined> = []
  const { index, sourceUrl } = await fetchWordPressIndex('https://elespectador.com/wp-json', {
    fetchImpl: async (input, init) => {
      requests.push(String(input))
      signals.push(init?.signal)
      assert.ok(init)
      assert.equal(init.credentials, 'omit')
      assert.equal((init.headers as Record<string, string>).Accept, 'application/json')
      if (requests.length === 1) throw new TypeError('Failed to fetch')
      return new Response(VALID_INDEX, { headers: { 'content-type': 'application/json' } })
    },
  })

  assert.deepEqual(requests, [
    'https://elespectador.com/wp-json',
    'https://www.elespectador.com/wp-json',
  ])
  assert.ok(signals[0])
  assert.equal(signals[0], signals[1])
  assert.equal(sourceUrl, 'https://www.elespectador.com/wp-json')
  assert.equal(index.name, 'Example')
  assert.deepEqual(convertWordPressIndex(index, sourceUrl).spec.servers, [{ url: sourceUrl }])
  const shareUrl = createShareableUrl('https://wp2oas.jdeep.in/', sourceUrl, 'wp/v2')
  assert.equal(readSharedSourceUrl(shareUrl), sourceUrl)
  assert.equal(new URL(shareUrl).hash, '#wp/v2')
})

test('www retry preserves the protocol, port, subdirectory, and REST query', async () => {
  for (const sourceUrl of [
    'https://example.com:8443/blog/wp-json',
    'http://example.com:8080/blog/?rest_route=%2F',
  ]) {
    const requests: string[] = []
    const result = await fetchWordPressIndex(sourceUrl, {
      pageProtocol: 'http:',
      fetchImpl: async (input) => {
        requests.push(String(input))
        if (requests.length === 1) throw new TypeError('Failed to fetch')
        return new Response(VALID_INDEX)
      },
    })
    const expectedUrl = sourceUrl.replace('example.com', 'www.example.com')
    assert.deepEqual(requests, [sourceUrl, expectedUrl])
    assert.equal(result.sourceUrl, expectedUrl)
  }
})

test('uses the final response URL after a successful browser redirect', async () => {
  const response = new Response(VALID_INDEX)
  Object.defineProperty(response, 'url', { value: 'https://www.example.com/blog/wp-json/' })
  const result = await fetchWordPressIndex('https://example.com/blog/wp-json', {
    fetchImpl: async () => response,
  })
  assert.equal(result.sourceUrl, 'https://www.example.com/blog/wp-json/')
})

test('does not retry www hostnames, IP addresses, or local hostnames', async () => {
  for (const hostname of [
    'www.example.com',
    '127.0.0.1',
    '[::1]',
    'localhost',
    'wordpress.localhost',
    'wordpress',
  ]) {
    let requests = 0
    await assert.rejects(
      fetchWordPressIndex(`https://${hostname}/wp-json`, {
        fetchImpl: async () => {
          requests += 1
          throw new TypeError('Failed to fetch')
        },
      }),
      (error: unknown) =>
        error instanceof WordPressInputError && error.code === 'network-failure',
    )
    assert.equal(requests, 1, hostname)
  }
})

test('does not retry HTTP errors or invalid responses', async () => {
  for (const { response, code } of [
    { response: new Response('Forbidden', { status: 403 }), code: 'http-error' },
    { response: new Response('<html>Not WordPress</html>'), code: 'non-json-response' },
    {
      response: new Response('{bad json', { headers: { 'content-type': 'application/json' } }),
      code: 'invalid-json',
    },
    { response: new Response('{"routes":{}}'), code: 'empty-routes' },
  ]) {
    let requests = 0
    await assert.rejects(
      fetchWordPressIndex('https://example.com/wp-json', {
        fetchImpl: async () => {
          requests += 1
          return response
        },
      }),
      (error: unknown) => error instanceof WordPressInputError && error.code === code,
    )
    assert.equal(requests, 1, code)
  }
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
  let requests = 0
  await assert.rejects(
    fetchWordPressIndex('https://example.com/wp-json', {
      fetchImpl: async () => {
        requests += 1
        throw new TypeError('Failed to fetch')
      },
    }),
    (error: unknown) =>
      error instanceof WordPressInputError && error.code === 'network-failure',
  )
  assert.equal(requests, 2)

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

test('cancels an in-flight www retry and times it out within the original budget', async () => {
  for (const expectedCode of ['aborted', 'timeout']) {
    const controller = new AbortController()
    const requests: string[] = []
    const request = fetchWordPressIndex('https://example.com/wp-json', {
      signal: controller.signal,
      timeoutMs: expectedCode === 'timeout' ? 10 : 1000,
      fetchImpl: async (input, init) => {
        requests.push(String(input))
        if (requests.length === 1) throw new TypeError('Failed to fetch')
        return new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError')),
          )
          if (expectedCode === 'aborted') controller.abort()
        })
      },
    })
    await assert.rejects(
      request,
      (error: unknown) =>
        error instanceof WordPressInputError && error.code === expectedCode,
    )
    assert.deepEqual(requests, [
      'https://example.com/wp-json',
      'https://www.example.com/wp-json',
    ])
  }
})

test('does not retry a timed-out or cancelled original request', async () => {
  for (const expectedCode of ['aborted', 'timeout']) {
    const controller = new AbortController()
    let requests = 0
    const request = fetchWordPressIndex('https://example.com/wp-json', {
      signal: controller.signal,
      timeoutMs: expectedCode === 'timeout' ? 10 : 1000,
      fetchImpl: async (_input, init) => {
        requests += 1
        return new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError')),
          )
          if (expectedCode === 'aborted') controller.abort()
        })
      },
    })
    await assert.rejects(
      request,
      (error: unknown) =>
        error instanceof WordPressInputError && error.code === expectedCode,
    )
    assert.equal(requests, 1)
  }
})
