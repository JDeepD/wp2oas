export interface WordPressArgument extends Record<string, unknown> {
  type?: unknown
  description?: unknown
  required?: unknown
  default?: unknown
  enum?: unknown
  format?: unknown
  minimum?: unknown
  maximum?: unknown
  minLength?: unknown
  maxLength?: unknown
  pattern?: unknown
  items?: unknown
}

export type WordPressArguments =
  | Record<string, WordPressArgument | unknown>
  | unknown[]
  | null

export interface WordPressEndpoint extends Record<string, unknown> {
  methods?: unknown
  args?: WordPressArguments
}

export interface WordPressRoute extends Record<string, unknown> {
  namespace?: unknown
  methods?: unknown
  args?: WordPressArguments
  endpoints?: unknown
}

export interface WordPressRestIndex extends Record<string, unknown> {
  name?: unknown
  description?: unknown
  url?: unknown
  home?: unknown
  namespace?: unknown
  namespaces?: unknown
  routes: Record<string, WordPressRoute | unknown>
}
