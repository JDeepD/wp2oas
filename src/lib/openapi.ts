export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue }

export interface OpenAPISchema {
  type?: 'string' | 'integer' | 'number' | 'boolean' | 'array' | 'object'
  format?: string
  description?: string
  default?: JsonValue
  enum?: JsonValue[]
  minimum?: number
  maximum?: number
  minLength?: number
  maxLength?: number
  pattern?: string
  items?: OpenAPISchema
  properties?: Record<string, OpenAPISchema>
  required?: string[]
  nullable?: boolean
  oneOf?: OpenAPISchema[]
  additionalProperties?: boolean | OpenAPISchema
}

export interface OpenAPIParameter {
  name: string
  in: 'path' | 'query'
  required: boolean
  description?: string
  schema: OpenAPISchema
}

export interface OpenAPIOperation {
  operationId: string
  summary?: string
  tags?: string[]
  parameters?: OpenAPIParameter[]
  requestBody?: {
    required: boolean
    content: {
      'application/json': { schema: OpenAPISchema }
    }
  }
  responses: Record<string, { description: string }>
}

export type OpenAPIHttpMethod =
  | 'get'
  | 'post'
  | 'put'
  | 'patch'
  | 'delete'
  | 'options'
  | 'head'

export type OpenAPIPathItem = Partial<
  Record<OpenAPIHttpMethod, OpenAPIOperation>
>

export interface OpenAPIDocument {
  openapi: '3.0.3'
  info: {
    title: string
    description?: string
    version: string
  }
  servers?: Array<{ url: string }>
  tags?: Array<{ name: string }>
  paths: Record<string, OpenAPIPathItem>
}
