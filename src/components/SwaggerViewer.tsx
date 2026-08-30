import { useEffect, useRef, useState } from 'react'
import 'swagger-ui-dist/swagger-ui.css'
import type { SwaggerUISystem } from 'swagger-ui-dist/swagger-ui-es-bundle.js'
import type { OpenAPIDocument } from '../lib/openapi.ts'

interface SwaggerViewerProps {
  spec: OpenAPIDocument
  onSectionSelect?(section: string): void
  onReady?(): void
}

function addSectionLinks(
  container: HTMLElement,
  onSectionSelect: (section: string) => void,
): number {
  const headings = container.querySelectorAll<HTMLElement>('.opblock-tag')

  for (const heading of headings) {
    if (heading.querySelector('.wp2oas-section-link')) continue
    const section = heading.dataset.tag
      ?? heading.querySelector('a')?.textContent?.trim()
    if (!section) continue

    const link = document.createElement('button')
    link.type = 'button'
    link.className = 'wp2oas-section-link'
    link.dataset.section = section
    link.textContent = '#'
    link.title = `Link to ${section}`
    link.setAttribute('aria-label', `Filter and link to ${section}`)
    link.addEventListener('click', (event) => {
      event.preventDefault()
      event.stopPropagation()
      onSectionSelect(section)
    })
    heading.prepend(link)
  }

  return headings.length
}

export function SwaggerViewer({
  spec,
  onSectionSelect,
  onReady,
}: SwaggerViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const latestSpecRef = useRef(spec)
  const systemRef = useRef<SwaggerUISystem | null>(null)
  const sectionSelectRef = useRef(onSectionSelect)
  const readyRef = useRef(onReady)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    let active = true
    let readyNotified = false
    const observer = new MutationObserver(() => {
      const sectionCount = addSectionLinks(
        container,
        (section) => sectionSelectRef.current?.(section),
      )
      if (sectionCount > 0 && !readyNotified) {
        readyNotified = true
        readyRef.current?.()
      }
    })
    observer.observe(container, { childList: true, subtree: true })

    void import('swagger-ui-dist/swagger-ui-es-bundle.js')
      .then(({ default: SwaggerUI }) => {
        if (!active) return
        systemRef.current = SwaggerUI({
          domNode: container,
          spec: latestSpecRef.current,
          deepLinking: true,
          displayRequestDuration: true,
          docExpansion: 'list',
          defaultModelsExpandDepth: -1,
          tryItOutEnabled: false,
        })
        setStatus('ready')
      })
      .catch(() => {
        if (!active) return
        setStatus('error')
      })

    return () => {
      active = false
      observer.disconnect()
      systemRef.current = null
      container.replaceChildren()
    }
  }, [])

  useEffect(() => {
    latestSpecRef.current = spec
    systemRef.current?.specActions.updateJsonSpec(spec)
  }, [spec])

  useEffect(() => {
    sectionSelectRef.current = onSectionSelect
    readyRef.current = onReady
  }, [onReady, onSectionSelect])

  return (
    <div className="swagger-viewer">
      {status === 'loading' && (
        <div className="swagger-initial-state" role="status">
          <span className="spinner" aria-hidden="true" />
          <span>Loading API reference...</span>
        </div>
      )}
      {status === 'error' && (
        <div className="swagger-initial-state" role="alert">
          Interactive documentation could not be loaded. JSON and YAML downloads are still available.
        </div>
      )}
      <div ref={containerRef} hidden={status !== 'ready'} />
    </div>
  )
}
