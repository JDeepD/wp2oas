import { useEffect, useMemo, useRef, useState } from 'react'
import { dump as toYaml } from 'js-yaml'
import { SwaggerViewer } from './components/SwaggerViewer.tsx'
import {
  convertWordPressIndex,
  type ConversionResult,
} from './lib/converter.ts'
import {
  fetchWordPressIndex,
  normalizeWordPressUrl,
  parseWordPressIndexJson,
  readWordPressIndexFile,
  WordPressInputError,
} from './lib/input.ts'
import type { OpenAPIDocument } from './lib/openapi.ts'
import { filterOpenApiDocument } from './lib/search.ts'
import type { WordPressRestIndex } from './lib/wordpress.ts'
import './App.css'

type InputMode = 'url' | 'file' | 'paste'

const INPUT_MODES: Array<{ id: InputMode; label: string }> = [
  { id: 'url', label: 'WordPress URL' },
  { id: 'file', label: 'Upload JSON' },
  { id: 'paste', label: 'Paste JSON' },
]

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value)

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedValue(value), delayMs)
    return () => window.clearTimeout(timeout)
  }, [delayMs, value])

  return debouncedValue
}

function ArrowIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M4 10h11m-4-4 4 4-4 4" />
    </svg>
  )
}

function DownloadIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M10 3v9m-3-3 3 3 3-3M4 16h12" />
    </svg>
  )
}

function ShieldIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M10 2.5 16 5v4.4c0 3.7-2.4 6.7-6 8.1-3.6-1.4-6-4.4-6-8.1V5l6-2.5Z" />
      <path d="m7.5 10 1.6 1.6 3.6-3.7" />
    </svg>
  )
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return 'The WordPress REST index could not be converted.'
}

function filenameFor(spec: OpenAPIDocument, extension: 'json' | 'yaml'): string {
  const siteName = spec.info.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60)
  return `${siteName || 'wordpress'}-openapi.${extension}`
}

function downloadDocument(spec: OpenAPIDocument, format: 'json' | 'yaml'): void {
  const contents =
    format === 'json'
      ? `${JSON.stringify(spec, null, 2)}\n`
      : toYaml(spec, { noRefs: true, lineWidth: 120 })
  const blob = new Blob([contents], {
    type: format === 'json' ? 'application/json' : 'application/yaml',
  })
  const objectUrl = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = objectUrl
  link.download = filenameFor(spec, format)
  document.body.append(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0)
}

function App() {
  const [mode, setMode] = useState<InputMode>('url')
  const [url, setUrl] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [pastedJson, setPastedJson] = useState('')
  const [result, setResult] = useState<ConversionResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [endpointSearch, setEndpointSearch] = useState('')
  const [fileInputKey, setFileInputKey] = useState(0)
  const requestController = useRef<AbortController | null>(null)
  const resultHeadingRef = useRef<HTMLHeadingElement>(null)
  const debouncedEndpointSearch = useDebouncedValue(endpointSearch, 200)
  const endpointSearchResult = useMemo(
    () => result ? filterOpenApiDocument(result.spec, debouncedEndpointSearch) : null,
    [debouncedEndpointSearch, result],
  )

  const selectMode = (nextMode: InputMode) => {
    setMode(nextMode)
    setError(null)
  }

  const handleTabKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    const currentIndex = INPUT_MODES.findIndex(({ id }) => id === mode)
    let nextIndex: number | undefined
    if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % INPUT_MODES.length
    if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + INPUT_MODES.length) % INPUT_MODES.length
    if (event.key === 'Home') nextIndex = 0
    if (event.key === 'End') nextIndex = INPUT_MODES.length - 1
    if (nextIndex === undefined) return

    event.preventDefault()
    const nextMode = INPUT_MODES[nextIndex].id
    selectMode(nextMode)
    window.setTimeout(() => document.getElementById(`tab-${nextMode}`)?.focus(), 0)
  }

  const loadIndex = async (): Promise<{
    index: WordPressRestIndex
    sourceUrl?: string
  }> => {
    if (mode === 'url') {
      const sourceUrl = normalizeWordPressUrl(url)
      const controller = new AbortController()
      requestController.current = controller
      const index = await fetchWordPressIndex(sourceUrl, { signal: controller.signal })
      return { index, sourceUrl }
    }
    if (mode === 'file') {
      if (!file) {
        throw new WordPressInputError('invalid-json', 'Choose a WordPress REST index JSON file.')
      }
      return { index: await readWordPressIndexFile(file) }
    }
    return { index: parseWordPressIndexJson(pastedJson) }
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    setIsLoading(true)

    try {
      const { index, sourceUrl } = await loadIndex()
      const nextResult = convertWordPressIndex(index, sourceUrl)
      setResult(nextResult)
      window.setTimeout(() => resultHeadingRef.current?.focus(), 0)
    } catch (cause) {
      setError(getErrorMessage(cause))
    } finally {
      requestController.current = null
      setIsLoading(false)
    }
  }

  const cancelRequest = () => requestController.current?.abort()

  const startOver = () => {
    requestController.current?.abort()
    setResult(null)
    setError(null)
    setUrl('')
    setFile(null)
    setPastedJson('')
    setEndpointSearch('')
    setFileInputKey((key) => key + 1)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <div className="app-shell">
      <header className="site-header">
        <button className="brand" type="button" onClick={startOver} aria-label="Start over">
          <span className="brand-mark" aria-hidden="true">W</span>
          <span>WP OpenAPI</span>
        </button>
        <div className="privacy-note">
          <ShieldIcon />
          <span>Private by design · runs in your browser</span>
        </div>
      </header>

      <main>
        <section className="intro" aria-labelledby="page-title">
          <p className="eyebrow">WordPress REST → OpenAPI 3.0</p>
          <h1 id="page-title">Turn a WordPress API into clear, usable documentation.</h1>
          <p className="intro-copy">
            Point to a REST index or bring your own JSON. We’ll convert its routes into an OpenAPI document and render it here without uploading or saving your data.
          </p>
        </section>

        {!result ? (
          <section className="converter-card" aria-labelledby="converter-title">
            <div className="card-heading">
              <div>
                <p className="step-label">01 · Add your REST index</p>
                <h2 id="converter-title">Choose an input</h2>
              </div>
              <span className="openapi-badge">OpenAPI 3.0.3</span>
            </div>

            <div className="mode-tabs" role="tablist" aria-label="Input method">
              {INPUT_MODES.map((inputMode) => (
                <button
                  key={inputMode.id}
                  id={`tab-${inputMode.id}`}
                  type="button"
                  role="tab"
                  aria-selected={mode === inputMode.id}
                  aria-controls={`panel-${inputMode.id}`}
                  tabIndex={mode === inputMode.id ? 0 : -1}
                  onClick={() => selectMode(inputMode.id)}
                  onKeyDown={handleTabKeyDown}
                >
                  {inputMode.label}
                </button>
              ))}
            </div>

            <form onSubmit={handleSubmit} noValidate>
              <div
                id={`panel-${mode}`}
                role="tabpanel"
                aria-labelledby={`tab-${mode}`}
                className="input-panel"
              >
                {mode === 'url' && (
                  <div className="field-group">
                    <label htmlFor="wordpress-url">WordPress site or REST index URL</label>
                    <div className="url-field">
                      <input
                        id="wordpress-url"
                        type="text"
                        inputMode="url"
                        autoComplete="url"
                        placeholder="https://example.com/wp-json"
                        value={url}
                        onChange={(event) => setUrl(event.target.value)}
                        disabled={isLoading}
                        aria-describedby="url-help"
                      />
                      <button className="primary-button" type="submit" disabled={isLoading}>
                        {isLoading ? 'Fetching…' : 'Fetch & convert'}
                        {!isLoading && <ArrowIcon />}
                      </button>
                    </div>
                    <p id="url-help" className="field-help">
                      A site URL, <code>/wp-json</code>, and <code>/?rest_route=/</code> are all supported. The target site must allow cross-origin requests.
                    </p>
                  </div>
                )}

                {mode === 'file' && (
                  <div className="field-group">
                    <label htmlFor="json-file">WordPress REST index file</label>
                    <label className="file-picker" htmlFor="json-file">
                      <span className="file-icon" aria-hidden="true">JSON</span>
                      <span>
                        <strong>{file ? file.name : 'Choose a JSON file'}</strong>
                        <small>{file ? `${(file.size / 1024).toFixed(1)} KB selected` : 'Up to 10 MB · read locally in your browser'}</small>
                      </span>
                      <span className="secondary-button">Browse</span>
                    </label>
                    <input
                      key={fileInputKey}
                      className="visually-hidden"
                      id="json-file"
                      type="file"
                      accept=".json,application/json"
                      onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                      disabled={isLoading}
                    />
                    <button className="primary-button standalone" type="submit" disabled={isLoading || !file}>
                      {isLoading ? 'Converting…' : 'Convert file'}
                      {!isLoading && <ArrowIcon />}
                    </button>
                  </div>
                )}

                {mode === 'paste' && (
                  <div className="field-group">
                    <label htmlFor="pasted-json">WordPress REST index JSON</label>
                    <textarea
                      id="pasted-json"
                      value={pastedJson}
                      onChange={(event) => setPastedJson(event.target.value)}
                      placeholder={'{\n  "name": "Example site",\n  "routes": { ... }\n}'}
                      spellCheck={false}
                      disabled={isLoading}
                    />
                    <div className="paste-footer">
                      <p className="field-help">Nothing you paste is sent to a server or stored.</p>
                      <button className="primary-button" type="submit" disabled={isLoading || !pastedJson.trim()}>
                        {isLoading ? 'Converting…' : 'Convert JSON'}
                        {!isLoading && <ArrowIcon />}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {isLoading && mode === 'url' && (
                <div className="loading-row" role="status">
                  <span className="spinner" aria-hidden="true" />
                  <span>Requesting the REST index…</span>
                  <button type="button" onClick={cancelRequest}>Cancel</button>
                </div>
              )}
              {error && <div className="error-message" role="alert"><strong>Conversion stopped.</strong> {error}</div>}
            </form>

            <footer className="card-footer">
              <span>No proxy</span>
              <span>No credentials</span>
              <span>No persistence</span>
            </footer>
          </section>
        ) : (
          <section className="results" aria-labelledby="results-title">
            <div className="results-heading">
              <div>
                <p className="step-label success-label">02 · Conversion complete</p>
                <h2 id="results-title" ref={resultHeadingRef} tabIndex={-1}>
                  {result.spec.info.title}
                </h2>
                <p>Your OpenAPI document is ready to inspect or download.</p>
              </div>
              <div className="result-actions">
                <button className="secondary-button" type="button" onClick={() => downloadDocument(result.spec, 'json')}>
                  <DownloadIcon /> JSON
                </button>
                <button className="secondary-button" type="button" onClick={() => downloadDocument(result.spec, 'yaml')}>
                  <DownloadIcon /> YAML
                </button>
                <button className="text-button" type="button" onClick={startOver}>Start over</button>
              </div>
            </div>

            <dl className="stats-grid" aria-label="Conversion statistics">
              <div><dt>WordPress routes</dt><dd>{result.stats.wordpressRoutes}</dd></div>
              <div><dt>OpenAPI paths</dt><dd>{result.stats.openApiPaths}</dd></div>
              <div><dt>Operations</dt><dd>{result.stats.operations}</dd></div>
              <div><dt>Skipped routes</dt><dd>{result.stats.skippedRoutes}</dd></div>
            </dl>

            <div className="documentation-heading">
              <div>
                <p className="step-label">03 · Explore the API</p>
                <h2>Interactive reference</h2>
              </div>
              <span className="swagger-label">Powered by Swagger UI</span>
            </div>
            <div className="endpoint-search">
              <label htmlFor="endpoint-search">Search endpoints</label>
              <div className="endpoint-search-field">
                <svg viewBox="0 0 20 20" aria-hidden="true">
                  <circle cx="8.5" cy="8.5" r="5.5" />
                  <path d="m12.5 12.5 4 4" />
                </svg>
                <input
                  id="endpoint-search"
                  type="search"
                  value={endpointSearch}
                  onChange={(event) => setEndpointSearch(event.target.value)}
                  placeholder="Search by path, method, operation, or namespace"
                />
                <span aria-live="polite">
                  {endpointSearchResult?.operations ?? 0} {endpointSearchResult?.operations === 1 ? 'operation' : 'operations'}
                </span>
              </div>
            </div>
            {endpointSearchResult && (
              <>
                <div
                  className="swagger-frame"
                  hidden={endpointSearchResult.operations === 0}
                >
                  <SwaggerViewer spec={endpointSearchResult.spec} />
                </div>
                {endpointSearchResult.operations === 0 && (
                  <div className="empty-search" role="status">
                    <strong>No endpoints found</strong>
                    <span>Try a path segment, HTTP method, operation ID, or namespace.</span>
                    <button type="button" onClick={() => setEndpointSearch('')}>Clear search</button>
                  </div>
                )}
              </>
            )}
          </section>
        )}
      </main>

      <footer className="site-footer">
        <p>Built for public WordPress REST indexes. Authentication data is intentionally unsupported.</p>
        <span>All processing stays in this tab.</span>
      </footer>
    </div>
  )
}

export default App
