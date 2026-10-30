import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CalendarDate } from './calendar-date.ts'

const { validDate } = await import(new URL('../../legacy/dist/business.js', import.meta.url).href)

test('dates are accepted exactly when legacy validDate accepts them', () => {
  for (const value of ['2026-10-24', '2024-02-29', '2023-02-29', '2026-13-01', '2026-04-31', '2026-1-05', ' 2026-01-05', '', null, undefined])
    assert.equal(CalendarDate.parse(value) !== null, validDate(value), String(value))
})

test('a parsed date prints back unchanged', () => {
  assert.equal(String(CalendarDate.parse('2024-02-29')), '2024-02-29')
})
