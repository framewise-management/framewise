import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ClientService } from '../clients/client-service.ts'
import { PgliteDatabase } from '../db/pglite-database.ts'
import type { EventRow } from '../db/rows.ts'
import { EventService, type DayInput } from '../events/event-service.ts'
import { PackageService } from '../packages/package-service.ts'
import { PaymentService } from './payment-service.ts'

const day = (over: Partial<DayInput> = {}): DayInput => ({ type: 'Wedding', date: '2026-12-10', venue: 'Pune', services: ['Candid'], ...over })

async function setup(client: Record<string, unknown>, days: DayInput[] = [day(), day({ type: 'Haldi' })]) {
  const db = await PgliteDatabase.create()
  const events = new EventService(db, () => '2026-10-24')
  const packages = new PackageService(db)
  const c = await new ClientService(db, events, packages).create(client, days)
  return { db, packages, payments: new PaymentService(db), clientId: c.id as string, events: await db.select<EventRow>('events') }
}

test('payments stay within the outstanding balance and need a date', async () => {
  const { db, payments, clientId } = await setup({ name: 'A', price: 100000 })
  const p = await payments.create({ client_id: clientId, amount: 60000, paid_on: '2026-10-24', stage: 'booking', method: 'UPI' })
  assert.deepEqual([p.amount, p.stage, p.source_date_unknown], [60000, 'Booking Amount', false])
  await assert.rejects(payments.create({ client_id: clientId, amount: 40001, paid_on: '2026-10-24' }), /within the outstanding balance/)
  await assert.rejects(payments.create({ client_id: clientId, amount: 0, paid_on: '2026-10-24' }), /within the outstanding balance/)
  await assert.rejects(payments.create({ client_id: clientId, amount: 10 }), /Enter the payment date/)
  await payments.create({ client_id: clientId, amount: 10, source_date_unknown: true })
  await assert.rejects(payments.create({ client_id: crypto.randomUUID(), amount: 10, paid_on: '2026-10-24' }), /Select a client/)
  assert.equal((await db.select('payments')).length, 2)
})

test('with packages a payment needs its package, an event inside it, and room in its balance', async () => {
  const { packages, payments, clientId, events } = await setup({ name: 'A' })
  const pre = await packages.create(clientId, { name: 'Pre', price: 10000, events: [events[0].id] })
  const main = await packages.create(clientId, { name: 'Main', price: 50000, events: [events[1].id] })
  const base = { client_id: clientId, paid_on: '2026-10-24' }
  await assert.rejects(payments.create({ ...base, amount: 100 }), /Select the payment package/)
  await assert.rejects(payments.create({ ...base, amount: 100, package_id: pre.id, event_id: events[1].id }), /Event does not belong to this package/)
  await assert.rejects(payments.create({ ...base, amount: 10001, package_id: pre.id }), /exceeds the package balance/)
  await payments.create({ ...base, amount: 10000, package_id: pre.id, event_id: events[0].id })
  await payments.create({ ...base, amount: 500, package_id: main.id })
})

test('per-day clients pay against each day', async () => {
  const { payments, clientId, events } = await setup({ name: 'A', finance_mode: 'Per day' }, [day({ price: 30000 }), day({ type: 'Haldi', price: 20000 })])
  const base = { client_id: clientId, paid_on: '2026-10-24' }
  await assert.rejects(payments.create({ ...base, amount: 30001, event_id: events[0].id }), /exceeds the event balance/)
  await payments.create({ ...base, amount: 30000, event_id: events[0].id })
  await assert.rejects(payments.create({ ...base, amount: 1, event_id: crypto.randomUUID() }), /Select an event belonging to this client/)
})

test('edits are re-checked without counting the payment itself, and leave an audit row', async () => {
  const { db, payments, clientId } = await setup({ name: 'A', price: 100000 })
  const p = await payments.create({ client_id: clientId, amount: 90000, paid_on: '2026-10-24' })
  const edited = await payments.edit(p.id as string, { amount: 100000, notes: 'corrected' })
  assert.equal(edited.amount, 100000)
  await assert.rejects(payments.edit(p.id as string, { amount: 100001 }), /within the outstanding balance/)
  const undated = await payments.edit(p.id as string, { paid_on: null })
  assert.deepEqual([undated.paid_on, undated.source_date_unknown], [null, true])
  assert.equal((await db.select('payment_audit')).length, 2)
})

test('stage targets replace the client plan and cannot exceed the quote', async () => {
  const { payments, clientId } = await setup({ name: 'A', price: 100000 })
  const plan = await payments.setStagePlan(clientId, { 'booking': 20000, 'On Event': 50000, 'Album printing': 0, 'Travel': 10000 })
  assert.deepEqual(plan.map(p => [p.stage, p.target]).sort(), [['Album Printing', 0], ['Booking Amount', 20000], ['On Event', 50000], ['Travel', 10000]])
  assert.deepEqual((await payments.setStagePlan(clientId, { Delivery: 5000 })).map(p => p.stage), ['Delivery'])
  await assert.rejects(payments.setStagePlan(clientId, { 'Booking Amount': 100001 }), /cannot exceed the quotation/)
  await assert.rejects(payments.setStagePlan(clientId, { 'Booking Amount': -1 }), /valid stage amounts/)
  assert.equal((await payments.stagePlans()).length, 1)
})
