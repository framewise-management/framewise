import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ClientService } from '../clients/client-service.ts'
import { PgliteDatabase } from '../db/pglite-database.ts'
import type { EventRow } from '../db/rows.ts'
import { EventService } from '../events/event-service.ts'
import { PackageService } from '../packages/package-service.ts'
import { ExpenseService } from './expense-service.ts'

test('expenses need a title, amount and date, and an event of their own client', async () => {
  const db = await PgliteDatabase.create()
  const clients = new ClientService(db, new EventService(db, () => '2026-10-24'), new PackageService(db))
  const day = { type: 'Wedding', date: '2026-12-10', venue: 'Pune', services: ['Candid'] }
  const a = await clients.create({ name: 'A' }, [day])
  const b = await clients.create({ name: 'B' }, [day])
  const [eventOfA] = await db.select<EventRow>('events', { client_id: a.id as string })
  const expenses = new ExpenseService(db)

  const x = await expenses.create({ title: ' Drone rent ', amount: 3500, spent_on: '2026-12-10', category: 'Drone Rent', client_id: a.id, event_id: eventOfA.id })
  assert.deepEqual([x.title, x.amount], ['Drone rent', 3500])
  await assert.rejects(expenses.create({ title: 'X', amount: 1, spent_on: '2026-12-10', client_id: b.id, event_id: eventOfA.id }), /event belonging to this client/)
  await assert.rejects(expenses.create({ title: 'X', amount: 1, spent_on: '2026-12-10', event_id: eventOfA.id }), /event belonging to this client/)
  await assert.rejects(expenses.create({ title: 'X', amount: -1, spent_on: '2026-12-10' }), /valid amount/)
  await assert.rejects(expenses.create({ title: 'X', amount: 1 }), /expense date/)
  await assert.rejects(expenses.create({ title: ' ', amount: 1, spent_on: '2026-12-10' }), /expense title/)
  await expenses.create({ title: 'Fuel', amount: 500, source_date_unknown: true })

  const undated = await expenses.update(x.id as string, { spent_on: null })
  assert.deepEqual([undated.spent_on, undated.source_date_unknown], [null, true])
  await clients.remove(a.id as string)
  assert.deepEqual((await expenses.list()).map(e => (e as unknown as { title: string }).title), ['Fuel'])
  await expenses.remove(x.id as string)
})
