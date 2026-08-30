# wp2oas

wp2oas is a client-side React application that converts a WordPress REST API index into an OpenAPI 3.0.3 document and renders it with Swagger UI.

## What it does

- Fetches a public WordPress REST index from a site URL, `/wp-json`, or `/?rest_route=/` URL.
- Imports a downloaded JSON file of up to 10 MB.
- Converts pasted REST index JSON.
- Maps WordPress namespaces, routes, methods, arguments, constraints, and named regex path parameters to OpenAPI.
- Reports route, path, operation, and skipped-route counts.
- Downloads the generated document as JSON or YAML.
- Creates reloadable share links for conversions made from public WordPress URLs.
- Creates section permalinks that reopen a result filtered to one API namespace.

Uploaded files, pasted JSON, and generated documents stay in browser memory. For URL conversions, the normalized public WordPress endpoint is added to the page URL so the result can be reopened or shared. A section permalink adds the namespace as the URL fragment and restores that filtered section when opened. The application has no backend, proxy, persistence layer, authentication flow, or analytics dependency.

## Development

```sh
npm install
npm run dev
```

Run all project checks with:

```sh
npm run check
```

The individual commands are `npm run lint`, `npm test`, and `npm run build`.

## Project structure

- `src/lib/converter.ts` contains the pure `convertWordPressIndex` implementation.
- `src/lib/input.ts` handles URL normalization, browser fetches, file reads, JSON parsing, and input errors.
- `src/lib/share.ts` creates and reads reloadable URL conversion links.
- `src/components/SwaggerViewer.tsx` mounts Swagger UI with the generated document through its `spec` option.
- `tests/` covers route conversion, method merging, schema mapping, server derivation, validation, cancellation, and network error classification.

## Browser fetch limitations

WordPress URL mode makes a direct browser request to the target site. The site must allow the application origin through CORS, and an HTTPS deployment cannot fetch an HTTP-only WordPress site. When a direct request is blocked, download the WordPress `/wp-json` response and use file upload or paste mode.

Credentials, cookies, authorization headers, application passwords, and private WordPress endpoints are intentionally unsupported.
