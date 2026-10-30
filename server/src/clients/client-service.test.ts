import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PackageService } from '../packages/package-service.ts'
import { PgliteDatabase } from '../db/pglite-database.ts'
import type { ClientRow, EventRow, PaymentRow } from '../db/rows.ts'
import type { DayInput } from '../events/event-service.ts'
import { EventService } from '../events/event-service.ts'
import { ClientService } from './client-service.ts'

const day = (over: Partial<DayInput> = {}): DayInput => ({ type: 'Wedding', date: '2026-12-10', venue: 'Pune', services: 'Candid, Cinematic', ...over })

async function setup() {
  const db = await PgliteDatabase.create()
  const events = new EventService(db, () => '2026-10-24')
  return { db, events, clients: new ClientService(db, events, new PackageService(db)) }
}

test('creating a client writes the client, its days and booking payments together', async () => {
  const { db, clients } = await setup()
  const c = await clients.create({ name: ' Asha & Rohan ', status: 'Booked' }, [day({ price: 80000, discount: 5000, booking_amount: 10000 }), day({ type: 'Haldi', date_not_fixed: true, date: undefined, price: 20000 })])
  assert.equal(c.code, 'WC-0001')
  assert.deepEqual([c.name, c.price, c.discount], ['Asha & Rohan', 100000, 5000])
  const events = await db.select<EventRow & { services: string[]; start_time: string }>('events')
  assert.deepEqual(events.map(e => [e.type, e.event_date, e.quotation, e.services]), [['Wedding', '2026-12-10', 75000, ['Candid', 'Cinematic']], ['Haldi', null, 20000, ['Candid', 'Cinematic']]])
  assert.equal(events[0].start_time, '09:00:00')
  const payments = await db.select<PaymentRow & { stage: string; paid_on: string }>('payments')
  assert.deepEqual(payments.map(p => [p.amount, p.stage, p.paid_on, p.event_id]), [[10000, 'Booking Amount', '2026-10-24', events[0].id]])
})

test('a failing day or an oversized booking leaves nothing behind', async () => {
  const { db, clients } = await setup()
  await assert.rejects(clients.create({ name: 'A' }, [day(), day({ venue: ' ' })]), /Complete type, date/)
  await assert.rejects(clients.create({ name: 'A', price: 1000 }, [day({ booking_amount: 2000 })]), /exceed/)
  await assert.rejects(clients.create({ name: ' ' }, [day()]), /Enter a client name/)
  await assert.rejects(clients.create({ name: 'A', price: 100, discount: 200 }, [day()]), /Discount must be between/)
  await assert.rejects(clients.create({ name: 'A', finance_mode: 'Per day' }, [day({ price: 1000, booking_amount: 1001 })]), /within the day quotation/)
  assert.deepEqual(await db.select('clients'), [])
  assert.deepEqual(await db.select('events'), [])
})

test('status changes carry over to events that follow the client', async () => {
  const { db, clients } = await setup()
  const c = await clients.create({ name: 'A', status: 'Tentative' }, [day()])
  const [e1] = await db.select<EventRow>('events')
  await db.apply([{ op: 'update', table: 'events', match: { id: e1.id }, set: { booking_status: 'Tentative' } }])
  await db.apply([{ op: 'insert', table: 'events', row: { client_id: c.id, type: 'Haldi', time_not_recorded: true, booking_status: 'Tentative', booking_override: true } }])
  await clients.update(c.id as string, { status: 'Booked' })
  const events = await db.select<EventRow>('events')
  assert.deepEqual(events.map(e => e.booking_status).sort(), ['Booked', 'Tentative'])
})

test('quote fields are locked once packages exist, and the wedding date follows the single wedding', async () => {
  const { db, clients } = await setup()
  const c = await clients.create({ name: 'A', price: 50000 }, [day()])
  const id = c.id as string
  await clients.update(id, { wedding_date: '2027-01-05' })
  assert.equal((await db.select<EventRow>('events'))[0].event_date, '2027-01-05')
  await assert.rejects(clients.update(id, { wedding_date: '2027-02-30' }), /valid wedding date/)
  await db.apply([{ op: 'insert', table: 'packages', row: { client_id: id, name: 'P', price: 50000 } }])
  await assert.rejects(clients.update(id, { price: 60000 }), /package card/)
  await clients.update(id, { price: 50000, notes: 'same price is fine' })
})

test('deleted clients disappear from lists and can be restored; order is kept', async () => {
  const { clients, events } = await setup()
  const a = await clients.create({ name: 'A' }, [day()])
  const b = await clients.create({ name: 'B' }, [day()])
  await clients.reorder([b.id as string, a.id as string])
  assert.deepEqual((await clients.list()).map(c => c.name), ['B', 'A'])
  await assert.rejects(clients.reorder([a.id as string]), /Invalid client order/)
  await clients.remove(a.id as string)
  assert.deepEqual((await clients.list()).map(c => c.name), ['B'])
  assert.deepEqual((await clients.deleted()).map((c: ClientRow) => c.name), ['A'])
  assert.equal((await events.list()).length, 1)
  await clients.restore(a.id as string)
  assert.equal((await clients.list()).length, 2)
  assert.equal((await events.list()).length, 2)
})
