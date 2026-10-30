import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ClientService } from '../clients/client-service.ts'
import { PgliteDatabase } from '../db/pglite-database.ts'
import type { DeliveryItemRow, EventRow, PaymentRow } from '../db/rows.ts'
import { EventService, type DayInput } from '../events/event-service.ts'
import { PackageService } from './package-service.ts'

const day = (over: Partial<DayInput> = {}): DayInput => ({ type: 'Wedding', date: '2026-12-10', venue: 'Pune', services: ['Candid'], ...over })

async function setup(days: DayInput[] = [day(), day({ type: 'Haldi' })], client: Record<string, unknown> = { name: 'A', price: 200000 }) {
  const db = await PgliteDatabase.create()
  const events = new EventService(db, () => '2026-10-24')
  const packages = new PackageService(db)
  const clients = new ClientService(db, events, packages)
  const c = await clients.create(client, days)
  const rows = await db.select<EventRow>('events')
  return { db, packages, clients, clientId: c.id as string, events: rows }
}

test('a package links its days and turns text lines into delivery items', async () => {
  const { db, packages, clientId, events } = await setup()
  const p = await packages.create(clientId, { name: 'Wedding', price: 150000, discount: 10000, events: [events[0].id], deliverables: 'Bride Album\n2 × Reels', complimentary: ['Frame'] })
  assert.deepEqual(p.events, [events[0].id])
  assert.deepEqual(p.items.map(i => [i.kind, i.label, i.status]), [['deliverable', 'Bride Album', 'Not set'], ['deliverable', '2 × Reels', 'Not set'], ['complimentary', 'Frame', 'Not set']])
  await assert.rejects(packages.create(clientId, { name: 'Other', price: 1000, events: [events[0].id] }), /already belongs to another package/)
  await assert.rejects(packages.create(clientId, { name: ' ', price: 1000 }), /Enter a package name/)
  const [other] = await db.apply([{ op: 'insert', table: 'clients', row: { name: 'B' } }])
  await assert.rejects(packages.create(other[0].id as string, { name: 'X', price: 1, events: [events[1].id] }), /must belong to this client/)
})

test('editing lines keeps matching items and their status; dropped lines retire', async () => {
  const { db, packages, clientId, events } = await setup()
  const p = await packages.create(clientId, { name: 'Wedding', price: 100000, events: [events[0].id], deliverables: ['Teaser', 'Highlight'] })
  await packages.updateDelivery(p.id, { items: [{ id: p.items[0].id, status: 'Yes', delivered_date: '2026-11-01' }] })
  const edited = await packages.update(p.id, { deliverables: ['Highlight', 'Teaser', 'Reels'] })
  assert.deepEqual(edited.items.map(i => [i.label, i.status]), [['Highlight', 'Not set'], ['Teaser', 'Yes'], ['Reels', 'Not set']])
  assert.equal(edited.items[1].id, p.items[0].id)
  const trimmed = await packages.update(p.id, { deliverables: ['Teaser'] })
  assert.deepEqual(trimmed.items.map(i => i.label), ['Teaser'])
  assert.equal((await db.select<DeliveryItemRow>('delivery_items')).filter(i => i.retired_at).length, 2)
  assert.deepEqual((await packages.update(p.id, { events: [events[0].id, events[1].id] })).events.sort(), [events[0].id, events[1].id].sort())
  assert.deepEqual((await packages.update(p.id, { events: [] })).events, [])
})

test('the first package must cover earlier receipts and takes them over; quotes stay above receipts', async () => {
  const { db, packages, clientId, events } = await setup([day({ booking_amount: 20000 }), day({ type: 'Haldi' })])
  await assert.rejects(packages.create(clientId, { name: 'Haldi', price: 50000, events: [events[1].id] }), /Include events with existing receipts/)
  const p = await packages.create(clientId, { name: 'All', price: 150000, events: events.map(e => e.id) })
  assert.equal((await db.select<PaymentRow>('payments'))[0].package_id, p.id)
  await assert.rejects(packages.update(p.id, { price: 19000 }), /cannot be below its receipts/)
  await assert.rejects(packages.update(p.id, { discount: 200000 }), /Discount must be between/)
})

test('item lists and delivery progress follow the delivery rules', async () => {
  const { packages, clientId, events } = await setup()
  const p = await packages.create(clientId, { name: 'Wedding', price: 1000, events: [events[0].id], deliverables: ['Album'] })
  const saved = await packages.saveItems(p.id, [{ id: p.items[0].id, kind: 'deliverable', label: 'Album', quantity: 2 }, { kind: 'complimentary', label: 'Frame' }])
  assert.deepEqual(saved.items.map(i => [i.label, i.quantity, i.kind]), [['Album', 2, 'deliverable'], ['Frame', null, 'complimentary']])
  const progress = await packages.updateDelivery(p.id, { drive_link: 'https://drive.example/x', items: [{ id: saved.items[0].id, status: 'Partial', delivered_quantity: 1 }] })
  assert.deepEqual([progress.drive_link, progress.items[0].status, progress.items[0].delivered_quantity], ['https://drive.example/x', 'Partial', 1])
  await assert.rejects(packages.updateDelivery(p.id, { drive_link: 'http://x' }), /secure https link/)
  await assert.rejects(packages.saveItems(p.id, [{ id: saved.items[0].id, kind: 'deliverable', label: 'Album', quantity: 1 }]), /partially delivered/)
})

test('a client can be created with packages, each with its booking receipt', async () => {
  const db = await PgliteDatabase.create()
  const events = new EventService(db, () => '2026-10-24')
  const packages = new PackageService(db)
  const clients = new ClientService(db, events, packages)
  const days = [day({ type: 'Pre-Wedding' }), day(), day({ type: 'Reception' })]
  const plans = [
    { name: 'Pre-Wedding', price: 14999, discount: 5000, day_indexes: [0], booking_amount: 2000, payment_date: '2026-07-09', deliverables: ['Reels'] },
    { name: 'Wedding & Reception', price: 80000, discount: 6000, day_indexes: [1, 2], booking_amount: 14800, payment_date: '2026-07-09', method: 'Cash' },
  ]
  await assert.rejects(clients.createPackaged({ name: 'K' }, days, [plans[0]]), /Link every event to a package/)
  await assert.rejects(clients.createPackaged({ name: 'K' }, days, [plans[0], { ...plans[1], day_indexes: [0, 1, 2] }]), /exactly one package/)
  await assert.rejects(clients.createPackaged({ name: 'K' }, days, [{ ...plans[0], booking_amount: 10000 }, plans[1]]), /within package value/)
  await assert.rejects(clients.createPackaged({ name: 'K' }, days, [{ ...plans[0], payment_date: undefined }, plans[1]]), /actual booking payment date/)
  const c = await clients.createPackaged({ name: 'Keyur & Priyal' }, days, plans)
  assert.deepEqual([c.price, c.discount, c.package_name], [94999, 11000, 'Multiple packages'])
  const list = await packages.list()
  assert.deepEqual(list.map(p => [p.name, p.events.length, p.items.length]), [['Pre-Wedding', 1, 1], ['Wedding & Reception', 2, 0]])
  const payments = await db.select<PaymentRow & { method: string }>('payments')
  assert.deepEqual(payments.map(p => [p.amount, p.stage, p.method, p.package_id]), [[2000, 'Booking Amount', 'UPI', list[0].id], [14800, 'Booking Amount', 'Cash', list[1].id]])
  assert.equal((await db.select<EventRow>('events')).every(e => e.quotation === 0), true)
})
