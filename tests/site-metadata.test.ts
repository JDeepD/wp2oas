import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizePublicSiteUrl } from '../scripts/site-metadata.ts'

test('normalizes the public site origin with a single trailing slash', () => {
  assert.equal(normalizePublicSiteUrl(' https://Example.com '), 'https://example.com/')
  assert.equal(normalizePublicSiteUrl('https://example.com/'), 'https://example.com/')
  assert.equal(normalizePublicSiteUrl('http://localhost:8080'), 'http://localhost:8080/')
})

test('requires a public site URL for production builds', () => {
  for (const value of [undefined, '', '   ']) {
    assert.throws(() => normalizePublicSiteUrl(value), /Set PUBLIC_SITE_URL/)
  }
})

test('rejects invalid public site URLs rather than generating misleading SEO URLs', () => {
  for (const value of [
    'example.com',
    'ftp://example.com',
    'https://user:password@example.com',
    'https://example.com/blog',
    'https://example.com/?url=https://other.example',
    'https://example.com/#section',
  ]) {
    assert.throws(() => normalizePublicSiteUrl(value), /PUBLIC_SITE_URL/)
  }
})
