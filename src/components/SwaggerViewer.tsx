import { useEffect, useRef } from 'react'
import 'swagger-ui-dist/swagger-ui.css'
import type { OpenAPIDocument } from '../lib/openapi.ts'

interface SwaggerViewerProps {
  spec: OpenAPIDocument
}

export function SwaggerViewer({ spec }: SwaggerViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    let active = true

    container.textContent = 'Preparing interactive documentation…'
    container.classList.add('swagger-loading')
    void import('swagger-ui-dist/swagger-ui-es-bundle.js')
      .then(({ default: SwaggerUI }) => {
        if (!active) return
        container.classList.remove('swagger-loading')
        SwaggerUI({
          domNode: container,
          spec,
          deepLinking: true,
          displayRequestDuration: true,
          docExpansion: 'list',
          defaultModelsExpandDepth: -1,
          tryItOutEnabled: false,
        })
      })
      .catch(() => {
        if (!active) return
        container.textContent = 'Interactive documentation could not be loaded. Your JSON and YAML downloads are still available.'
      })

    return () => {
      active = false
      container.replaceChildren()
    }
  }, [spec])

  return <div ref={containerRef} className="swagger-viewer" aria-live="polite" />
}
