import type { WordPressRestIndex } from './wordpress.ts'

export const MAX_INDEX_FILE_BYTES = 10 * 1024 * 1024
export const DEFAULT_FETCH_TIMEOUT_MS = 20_000

export type InputErrorCode =
  | 'invalid-url'
  | 'unsupported-protocol'
  | 'mixed-content'
  | 'network-failure'
  | 'http-error'
  | 'non-json-response'
  | 'invalid-json'
  | 'invalid-schema'
  | 'empty-routes'
  | 'file-too-large'
  | 'aborted'
  | 'timeout'

export class WordPressInputError extends Error {
  readonly code: InputErrorCode

  constructor(code: InputErrorCode, message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'WordPressInputError'
    this.code = code
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasExplicitScheme(value: string): boolean {
  return /^[A-Za-z][A-Za-z\d+.-]*:/.test(value)
}

export function normalizeWordPressUrl(input: string): string {
  const trimmed = input.trim()
  if (!trimmed) {
    throw new WordPressInputError('invalid-url', 'Enter a WordPress site URL.')
  }

  if (hasExplicitScheme(trimmed) && !/^https?:/i.test(trimmed)) {
    throw new WordPressInputError(
      'unsupported-protocol',
      'Only HTTP and HTTPS WordPress URLs are supported.',
    )
  }

  let url: URL
  try {
    url = new URL(hasExplicitScheme(trimmed) ? trimmed : `https://${trimmed}`)
  } catch (cause) {
    throw new WordPressInputError(
      'invalid-url',
      'Enter a valid WordPress URL, such as https://example.com.',
      { cause },
    )
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new WordPressInputError(
      'unsupported-protocol',
      'Only HTTP and HTTPS WordPress URLs are supported.',
    )
  }
  if (!url.hostname || url.username || url.password) {
    throw new WordPressInputError(
      'invalid-url',
      'Enter a public WordPress URL without embedded credentials.',
    )
  }

  url.hash = ''
  if (url.searchParams.has('rest_route')) {
    url.search = ''
    url.searchParams.set('rest_route', '/')
    return url.toString()
  }

  const marker = '/wp-json'
  const markerIndex = url.pathname.indexOf(marker)
  url.pathname =
    markerIndex >= 0
      ? url.pathname.slice(0, markerIndex + marker.length)
      : `${url.pathname.replace(/\/+$/, '')}${marker}`
  url.search = ''
  return url.toString().replace(/\/$/, '')
}

function assertWordPressShape(value: unknown): WordPressRestIndex {
  if (!isRecord(value)) {
    throw new WordPressInputError(
      'invalid-schema',
      'The input must be a JSON object containing a WordPress REST index.',
    )
  }
  if (!isRecord(value.routes)) {
    throw new WordPressInputError(
      'invalid-schema',
      'The JSON does not contain the required WordPress routes object.',
    )
  }

  const entries = Object.entries(value.routes)
  if (!entries.length) {
    throw new WordPressInputError(
      'empty-routes',
      'The WordPress REST index contains an empty routes object.',
    )
  }

  const resemblesWordPress = entries.some(
    ([path, route]) =>
      path.startsWith('/') &&
      isRecord(route) &&
      ('methods' in route || 'endpoints' in route || 'namespace' in route),
  )
  if (!resemblesWordPress) {
    throw new WordPressInputError(
      'invalid-schema',
      'The routes do not resemble a WordPress REST API index.',
    )
  }

  return value as WordPressRestIndex
}

export function parseWordPressIndexJson(json: string): WordPressRestIndex {
  const cleanJson = json.replace(/^\uFEFF/, '').trim()
  if (!cleanJson) {
    throw new WordPressInputError('invalid-json', 'Provide WordPress REST index JSON to convert.')
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(cleanJson)
  } catch (cause) {
    throw new WordPressInputError(
      'invalid-json',
      'The input is not valid JSON. Check for missing commas, quotes, or brackets.',
      { cause },
    )
  }
  return assertWordPressShape(parsed)
}

interface ReadableIndexFile {
  size: number
  text(): Promise<string>
}

export async function readWordPressIndexFile(
  file: ReadableIndexFile,
  maxBytes = MAX_INDEX_FILE_BYTES,
): Promise<WordPressRestIndex> {
  if (file.size > maxBytes) {
    const limit = Math.round(maxBytes / 1024 / 1024)
    throw new WordPressInputError(
      'file-too-large',
      `The selected file is too large. Choose a JSON file smaller than ${limit} MB.`,
    )
  }

  let contents: string
  try {
    contents = await file.text()
  } catch (cause) {
    throw new WordPressInputError(
      'invalid-json',
      'The selected file could not be read.',
      { cause },
    )
  }
  return parseWordPressIndexJson(contents)
}

interface FetchIndexOptions {
  signal?: AbortSignal
  timeoutMs?: number
  fetchImpl?: typeof fetch
  pageProtocol?: string
}

function currentPageProtocol(): string | undefined {
  return typeof window === 'undefined' ? undefined : window.location.protocol
}

function networkFailure(cause: unknown): WordPressInputError {
  return new WordPressInputError(
    'network-failure',
    'The WordPress REST index could not be fetched. CORS, connectivity, TLS, or blocking by the target site may be responsible. You can download the /wp-json response and use File upload or Paste JSON instead.',
    { cause },
  )
}

export async function fetchWordPressIndex(
  normalizedUrl: string,
  options: FetchIndexOptions = {},
): Promise<WordPressRestIndex> {
  const pageProtocol = options.pageProtocol ?? currentPageProtocol()
  const target = new URL(normalizedUrl)
  if (pageProtocol === 'https:' && target.protocol === 'http:') {
    throw new WordPressInputError(
      'mixed-content',
      'This HTTPS page cannot fetch an HTTP WordPress site. Use the site’s HTTPS URL, or import a downloaded JSON file instead.',
    )
  }

  if (options.signal?.aborted) {
    throw new WordPressInputError('aborted', 'The request was cancelled.')
  }

  const controller = new AbortController()
  const timeoutMs = options.timeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS
  let timedOut = false
  const timeout = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)
  const abortFromCaller = () => controller.abort()
  options.signal?.addEventListener('abort', abortFromCaller, { once: true })

  try {
    let response: Response
    try {
      response = await (options.fetchImpl ?? fetch)(normalizedUrl, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        credentials: 'omit',
        signal: controller.signal,
      })
    } catch (cause) {
      if (timedOut) {
        throw new WordPressInputError(
          'timeout',
          `The WordPress site did not respond within ${Math.ceil(timeoutMs / 1000)} seconds.`,
          { cause },
        )
      }
      if (options.signal?.aborted || controller.signal.aborted) {
        throw new WordPressInputError('aborted', 'The request was cancelled.', { cause })
      }
      throw networkFailure(cause)
    }

    if (!response.ok) {
      throw new WordPressInputError(
        'http-error',
        `The WordPress site returned HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ''}.`,
      )
    }

    let body: string
    try {
      body = await response.text()
    } catch (cause) {
      if (timedOut) {
        throw new WordPressInputError('timeout', 'The response timed out while downloading.', {
          cause,
        })
      }
      if (controller.signal.aborted) {
        throw new WordPressInputError('aborted', 'The request was cancelled.', { cause })
      }
      throw networkFailure(cause)
    }

    try {
      return parseWordPressIndexJson(body)
    } catch (cause) {
      if (
        cause instanceof WordPressInputError &&
        cause.code === 'invalid-json' &&
        !response.headers.get('content-type')?.toLowerCase().includes('json')
      ) {
        throw new WordPressInputError(
          'non-json-response',
          'The URL returned a non-JSON response. Confirm that it points to the WordPress REST index.',
          { cause },
        )
      }
      throw cause
    }
  } finally {
    clearTimeout(timeout)
    options.signal?.removeEventListener('abort', abortFromCaller)
  }
}
