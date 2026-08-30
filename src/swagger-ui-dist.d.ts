declare module 'swagger-ui-dist/swagger-ui-es-bundle.js' {
  export interface SwaggerUISystem {
    specActions: {
      updateJsonSpec(spec: unknown): void
    }
  }

  interface SwaggerUIOptions {
    domNode: Element
    spec: unknown
    deepLinking?: boolean
    displayRequestDuration?: boolean
    docExpansion?: 'none' | 'list' | 'full'
    defaultModelRendering?: 'example' | 'model'
    defaultModelsExpandDepth?: number
    tryItOutEnabled?: boolean
  }

  export default function SwaggerUI(options: SwaggerUIOptions): SwaggerUISystem
}
