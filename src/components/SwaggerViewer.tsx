import { useEffect, useRef, useState } from 'react'
import 'swagger-ui-dist/swagger-ui.css'
import type { SwaggerUISystem } from 'swagger-ui-dist/swagger-ui-es-bundle.js'
import type { OpenAPIDocument } from '../lib/openapi.ts'

interface SwaggerViewerProps {
  spec: OpenAPIDocument
}

export function SwaggerViewer({ spec }: SwaggerViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const latestSpecRef = useRef(spec)
  const systemRef = useRef<SwaggerUISystem | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    let active = true

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
      systemRef.current = null
      container.replaceChildren()
    }
  }, [])

  useEffect(() => {
    latestSpecRef.current = spec
    systemRef.current?.specActions.updateJsonSpec(spec)
  }, [spec])

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
