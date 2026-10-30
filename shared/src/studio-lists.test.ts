import { test } from 'node:test'
import assert from 'node:assert/strict'
import { StudioLists } from './studio-lists.ts'
import { Booking } from './booking.ts'

const legacy = await import(new URL('../../legacy/dist/business.js', import.meta.url).href)

test('lists match the legacy app', () => {
  assert.deepEqual(StudioLists.services, legacy.services)
  assert.deepEqual(StudioLists.leadSources, legacy.leadSources)
  assert.deepEqual(StudioLists.budgets, legacy.budgets)
  assert.deepEqual(StudioLists.expenseCategories, legacy.expenseCategories)
  assert.deepEqual(StudioLists.deliveryItems, legacy.deliveryItems)
  assert.deepEqual(Booking.statuses, legacy.bookingStatuses)
})

test('services parse like legacy serviceList', () => {
  for (const value of ['Cinematic, Candid', ' a ,, b ,', '', null, undefined, ['Drone', 'Candid']])
    assert.deepEqual(StudioLists.parseServices(value), legacy.serviceList(value), String(value))
})
