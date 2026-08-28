declare module 'swagger-ui-dist/swagger-ui-es-bundle.js' {
  interface SwaggerUIOptions {
    domNode: Element
    spec: unknown
    deepLinking?: boolean
    displayRequestDuration?: boolean
    docExpansion?: 'none' | 'list' | 'full'
    defaultModelsExpandDepth?: number
    tryItOutEnabled?: boolean
  }

  export default function SwaggerUI(options: SwaggerUIOptions): unknown
}
