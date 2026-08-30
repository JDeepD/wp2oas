import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createShareableUrl,
  readSharedSection,
  readSharedSourceUrl,
  removeSharedSourceUrl,
} from '../src/lib/share.ts'

test('creates and reads a shareable WordPress source URL', () => {
  const sharedUrl = createShareableUrl(
    'https://tools.example/wp2oas/?theme=light#results',
    'https://wordpress.example/blog/wp-json',
  )

  assert.equal(
    sharedUrl,
    'https://tools.example/wp2oas/?url=https://wordpress.example/blog/wp-json&theme=light',
  )
  assert.equal(
    readSharedSourceUrl(sharedUrl),
    'https://wordpress.example/blog/wp-json',
  )
})

test('keeps query-based WordPress routes readable', () => {
  const sharedUrl = createShareableUrl(
    'https://tools.example/',
    'https://wordpress.example/?rest_route=%2F',
  )

  assert.equal(
    sharedUrl,
    'https://tools.example/?url=https://wordpress.example/?rest_route=%2F',
  )
  assert.equal(
    readSharedSourceUrl(sharedUrl),
    'https://wordpress.example/?rest_route=%2F',
  )
})

test('adds and reads a section fragment without obscuring the source URL', () => {
  const sharedUrl = createShareableUrl(
    'https://tools.example/',
    'https://wordpress.example/wp-json',
    'ee-wires/v1',
  )

  assert.equal(
    sharedUrl,
    'https://tools.example/?url=https://wordpress.example/wp-json#ee-wires/v1',
  )
  assert.equal(readSharedSection(sharedUrl), 'ee-wires/v1')
  assert.equal(
    readSharedSourceUrl(sharedUrl),
    'https://wordpress.example/wp-json',
  )
})

test('continues to read previously encoded share links', () => {
  assert.equal(
    readSharedSourceUrl(
      'https://tools.example/?url=https%3A%2F%2Fwordpress.example%2Fwp-json',
    ),
    'https://wordpress.example/wp-json',
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
  assert.equal(readSharedSection('https://tools.example/'), undefined)
})
