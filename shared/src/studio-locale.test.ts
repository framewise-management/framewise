import { test } from 'node:test'
import assert from 'node:assert/strict'
import { StudioLocale } from './studio-locale.ts'

test('today is the date in India, not UTC', () => {
  assert.equal(StudioLocale.today(new Date('2026-10-24T20:00:00Z')), '2026-10-25')
  assert.equal(StudioLocale.today(new Date('2026-10-24T18:00:00Z')), '2026-10-24')
})
