import { test } from 'node:test'
import assert from 'node:assert/strict'
import { StudioData } from './studio-data.ts'
import type { Client, Lists, Package, Payment, StudioEvent } from './types.ts'

const client = (over: Partial<Client>): Client => ({ id: 'c1', code: 'WC-0001', name: 'A', price: 0, discount: 0, finance_mode: 'Shared', status: 'Booked', ...over } as Client)
const event = (over: Partial<StudioEvent>): StudioEvent => ({ id: 'e1', client_id: 'c1', type: 'Wedding', event_date: '2026-12-10', start_time: '09:00:00', status: 'Scheduled', booking_status: null, quotation: 0, team: [], ...over } as StudioEvent)
const pay = (over: Partial<Payment>): Payment => ({ id: crypto.randomUUID(), client_id: 'c1', event_id: null, package_id: null, amount: 0, stage: 'Booking Amount', ...over } as Payment)
const lists = (over: Partial<Lists>): Lists => ({ clients: [], events: [], packages: [], payments: [], enquiries: [], stagePlans: [], team: [], ...over })

test('balances follow the client pricing model', () => {
  const shared = StudioData.of(lists({ clients: [client({ price: 100000, discount: 10000 })], payments: [pay({ amount: 30000 })] }))
  assert.deepEqual([shared.quote('c1'), shared.paid('c1'), shared.balance('c1')], [90000, 30000, 60000])

  const packaged = StudioData.of(lists({
    clients: [client({ price: 999 })],
    packages: [{ id: 'p1', client_id: 'c1', price: 50000, discount: 5000 } as Package, { id: 'p2', client_id: 'c1', price: 20000, discount: 0 } as Package],
    payments: [pay({ amount: 45000, package_id: 'p1' })],
  }))
  assert.deepEqual([packaged.quote('c1'), packaged.balance('c1'), packaged.packageBalance(packaged.packages[0])], [65000, 20000, 0])

  const perDay = StudioData.of(lists({ clients: [client({ finance_mode: 'Per day' })], events: [event({ quotation: 30000 }), event({ id: 'e2', quotation: 20000 })] }))
  assert.equal(perDay.quote('c1'), 50000)
})

test('events sort by date, booking state follows the client, and the next event skips closed ones', () => {
  const data = StudioData.of(lists({
    clients: [client({ status: 'Booked' })],
    events: [event({ id: 'late', event_date: '2027-01-02' }), event({ id: 'lost', event_date: '2026-11-01', booking_status: 'Lost' }), event({ id: 'soon', event_date: '2026-11-05' })],
  }))
  assert.deepEqual(data.events.map(e => e.id), ['lost', 'soon', 'late'])
  assert.deepEqual([data.booking(data.event('soon')!), data.booking(data.event('lost')!)], ['Confirmed', 'Lost'])
  assert.equal(data.nextEvent('c1', '2026-10-24')?.id, 'soon')
  assert.deepEqual(data.bookedEvents('c1').map(e => e.id), ['soon', 'late'])
})
