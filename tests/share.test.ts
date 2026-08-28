import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createShareableUrl,
  readSharedSourceUrl,
  removeSharedSourceUrl,
} from '../src/lib/share.ts'

test('creates and reads a shareable WordPress source URL', () => {
  const sharedUrl = createShareableUrl(
    'https://tools.example/wp-openapi/?theme=light#results',
    'https://wordpress.example/blog/wp-json',
  )

  assert.equal(
    sharedUrl,
    'https://tools.example/wp-openapi/?theme=light&url=https%3A%2F%2Fwordpress.example%2Fblog%2Fwp-json',
  )
  assert.equal(
    readSharedSourceUrl(sharedUrl),
    'https://wordpress.example/blog/wp-json',
  )
})

test('removes only the shared source parameter', () => {
  assert.equal(
    removeSharedSourceUrl(
      'https://tools.example/?url=https%3A%2F%2Fwordpress.example%2Fwp-json&theme=light#results',
    ),
    'https://tools.example/?theme=light',
  )
  assert.equal(readSharedSourceUrl('https://tools.example/'), undefined)
})
