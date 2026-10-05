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
cp .env.example .env.local
npm run dev
```

Set `PUBLIC_SITE_URL` in `.env.local` to the public site origin (an absolute HTTP or
HTTPS URL without credentials, a path, query, or fragment). A trailing slash is
optional. Production builds require this variable and stop with a clear error when
it is missing or invalid. Development defaults to `http://localhost:5173` when the
variable is absent. Vite also reads mode-specific files such as `.env.production`;
environment variables provided by the build platform take precedence.

In Cloudflare's build environment, add `PUBLIC_SITE_URL` with the value
`https://wp2oas.jdeep.in`, use `npm run build`, and deploy the `dist` output directory.
The variable is read at build time and does not need a `VITE_` prefix. Changing it
requires rebuilding the site. Configure it for every environment that runs a build,
including previews if enabled.

Run all project checks with:

```sh
npm run check
```

The individual commands are `npm run lint`, `npm test`, and `npm run build`.

The build prerenders the homepage into `dist/index.html`, including the converter,
usage instructions, and common questions. React hydrates that HTML in the browser;
shared API links mount with their own initial state. Prerendering happens only at
build time and does not add a runtime server or fetch any WordPress data. The build
script requires Node.js 22.18 or newer, consistent with the existing TypeScript test
runner.

## Project structure

- `src/lib/converter.ts` contains the pure `convertWordPressIndex` implementation.
- `src/lib/input.ts` handles URL normalization, browser fetches, file reads, JSON parsing, and input errors.
- `src/lib/share.ts` creates and reads reloadable URL conversion links.
- `src/components/ConverterGuide.tsx` provides usage instructions and common questions.
- `src/components/SwaggerViewer.tsx` mounts Swagger UI with the generated document through its `spec` option.
- `src/prerender.ts` and `scripts/prerender.ts` render the homepage during the production build.
- `scripts/site-metadata.ts` validates the public site URL and generates SEO metadata and crawler files.
- `tests/` covers route conversion, method merging, schema mapping, server derivation, validation, cancellation, and network error classification.

## Search engine discovery

The homepage includes a descriptive title and description, a canonical URL,
Open Graph and Twitter metadata, and Schema.org `WebApplication` structured data.
Swagger UI and its stylesheet load only after conversion, keeping them out of the
initial homepage download.
The canonical URL, Open Graph URL, structured-data URLs, robots sitemap directive,
and sitemap entry all come from `PUBLIC_SITE_URL`. Shared conversion links retain
the homepage's canonical URL. `robots.txt` allows crawling and advertises the
configured site's `/sitemap.xml`. The sitemap lists the homepage rather than
individual conversion links. Both files are generated into `dist/` during the build.

After deploying the complete `dist/` directory:

1. Check that `/robots.txt` serves plain text and `/sitemap.xml` serves XML, rather
   than the application's HTML fallback. Make sure hosting does not apply a
   `noindex` response header or block search crawlers.
2. Verify `https://wp2oas.jdeep.in/` in
   [Google Search Console](https://search.google.com/search-console) and
   [Bing Webmaster Tools](https://www.bing.com/webmasters/).
3. Submit `https://wp2oas.jdeep.in/sitemap.xml` in both tools. In Search Console,
   inspect the homepage and request indexing after verifying the live content.

Metadata and prerendering help search engines discover and understand the site;
they do not guarantee indexing or a particular ranking. See Google's
[JavaScript SEO guidance](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics)
and [sitemap guidance](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap).

## Browser fetch limitations

WordPress URL mode makes a direct browser request to the target site. The site must allow the application origin through CORS, and an HTTPS deployment cannot fetch an HTTP-only WordPress site. After a network failure, the application retries once with `www.` prefixed to the hostname, preserving the protocol, port, path, and query. Existing `www` hostnames, IP addresses, and local hostnames are excluded. This can work around a bare-domain redirect that lacks CORS headers when the `www` endpoint allows access. A successful request uses its final URL for the input field, generated document, and share links. Both attempts share the same timeout and cancellation signal; HTTP errors and invalid responses do not trigger a retry. The browser cannot distinguish CORS from other network failures or read a CORS-blocked redirect, so this fallback cannot resolve all CORS restrictions. If both requests fail, download the WordPress `/wp-json` response and use file upload or paste mode.

Credentials, cookies, authorization headers, application passwords, and private WordPress endpoints are intentionally unsupported.
