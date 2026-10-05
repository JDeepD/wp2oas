import type { Plugin } from 'vite'

export function normalizePublicSiteUrl(value: string | undefined): string {
  if (!value?.trim()) {
    throw new Error('Set PUBLIC_SITE_URL to your public site URL before building, for example https://example.com.')
  }

  let url: URL
  try {
    url = new URL(value.trim())
  } catch {
    throw new Error('PUBLIC_SITE_URL must be an absolute HTTP or HTTPS URL.')
  }
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username || url.password ||
    url.pathname !== '/' || url.search || url.hash
  ) {
    throw new Error('PUBLIC_SITE_URL must be an HTTP or HTTPS site origin without credentials, a path, query, or fragment.')
  }
  return `${url.origin}/`
}

function escapeMarkup(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;')
}

export function siteMetadataPlugin(siteUrl: string): Plugin {
  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    '@id': `${siteUrl}#application`,
    name: 'wp2oas',
    url: siteUrl,
    description: 'Convert a WordPress REST API index to an OpenAPI 3.0.3 specification, explore endpoints with Swagger UI, and download JSON or YAML entirely in your browser.',
    applicationCategory: 'DeveloperApplication',
    operatingSystem: 'Any',
    browserRequirements: 'Requires JavaScript for API conversion.',
    isAccessibleForFree: true,
    featureList: [
      'WordPress REST API to OpenAPI 3.0.3 conversion',
      'WordPress URL, JSON file, and pasted JSON inputs',
      'Interactive Swagger UI documentation',
      'JSON and YAML downloads',
      'Local processing without uploading input',
    ],
  }

  return {
    name: 'wp2oas-site-metadata',
    transformIndexHtml(html) {
      return html
        .replaceAll('__PUBLIC_SITE_URL__', escapeMarkup(siteUrl))
        .replace('__SITE_STRUCTURED_DATA__', () =>
          JSON.stringify(structuredData, null, 2).replaceAll('<', '\\u003c'),
        )
    },
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'robots.txt',
        source: `User-agent: *\nAllow: /\n\nSitemap: ${new URL('sitemap.xml', siteUrl).href}\n`,
      })
      this.emitFile({
        type: 'asset',
        fileName: 'sitemap.xml',
        source: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url>\n    <loc>${escapeMarkup(siteUrl)}</loc>\n  </url>\n</urlset>\n`,
      })
    },
  }
}
