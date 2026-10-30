import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ProductionStages } from '@framewise/shared/production-stages.ts'
import { ClientService } from '../clients/client-service.ts'
import { PackageService } from '../packages/package-service.ts'
import { PgliteDatabase } from '../db/pglite-database.ts'
import type { ClientRow, EventRow, ProjectRow } from '../db/rows.ts'
import { EventService, type DayInput } from './event-service.ts'

const day = (over: Partial<DayInput> = {}): DayInput => ({ type: 'Wedding', date: '2026-12-10', venue: 'Pune', services: ['Candid'], ...over })

async function setup(client: Record<string, unknown> = { name: 'A', status: 'Booked', price: 100000 }) {
  const db = await PgliteDatabase.create()
  const events = new EventService(db, () => '2026-10-24')
  const c = await new ClientService(db, events, new PackageService(db)).create(client, [day()])
  const [event] = await db.select<EventRow>('events')
  return { db, events, clientId: c.id as string, event }
}

test('more days can be added, but not with booking payments once packages exist', async () => {
  const { db, events, clientId } = await setup()
  const added = await events.addDays(clientId, [day({ type: 'Haldi' }), day({ type: 'Reception', booking_amount: 5000 })])
  assert.deepEqual(added.map(e => e.type), ['Haldi', 'Reception'])
  assert.equal((await db.select('payments')).length, 1)
  await assert.rejects(events.addDays(clientId, []), /1 to 31 days/)
  await db.apply([{ op: 'insert', table: 'packages', row: { client_id: clientId, name: 'P', price: 100000 } }])
  await assert.rejects(events.addDays(clientId, [day({ booking_amount: 1 })]), /link it in Edit package/)
})

test('a completed shoot opens one production project; finishing all projects completes the client', async () => {
  const { db, events, clientId, event } = await setup()
  await events.update(event.id, { status: 'Shoot Completed' })
  await events.update(event.id, { status: 'Shoot Completed', notes: 'again' })
  const projects = await db.select<ProjectRow>('projects')
  assert.equal(projects.length, 1)
  assert.deepEqual(projects[0].stage_names, ProductionStages.defaults)
  assert.deepEqual(projects[0].completed_stages, ['Shoot Completed'])

  await db.apply([{ op: 'update', table: 'projects', match: { id: projects[0].id }, set: { stage: 14, completed_stages: ProductionStages.defaults } }])
  await events.update(event.id, { notes: 'final check' })
  const [client] = await db.select<ClientRow>('clients')
  assert.deepEqual([client.status, client.completion_previous_status], ['Completed', 'Booked'])

  await events.addDays(clientId, [day({ type: 'Reception' })])
  assert.equal((await db.select<ClientRow>('clients'))[0].status, 'Booked')
})

test('price changes recompute the day quotation and respect payments', async () => {
  const { db, events, clientId, event } = await setup({ name: 'A', finance_mode: 'Per day' })
  await events.update(event.id, { price: 30000, discount: 5000 })
  assert.equal((await db.select<EventRow>('events'))[0].quotation, 25000)
  await db.apply([{ op: 'insert', table: 'payments', row: { client_id: clientId, event_id: event.id, amount: 20000, paid_on: '2026-10-24' } }])
  await assert.rejects(events.update(event.id, { discount: 15000 }), /exceed/)
  await assert.rejects(events.update(event.id, { price: 100, discount: 200 }), /Discount must be between/)
  await assert.rejects(events.remove(event.id), /financial history/)
})

test('event team is replaced as a set and events without money can be deleted', async () => {
  const { db, events, event } = await setup()
  const [[a], [b]] = await db.apply([
    { op: 'insert', table: 'team_members', row: { name: 'Asha' } },
    { op: 'insert', table: 'team_members', row: { name: 'Ben' } },
  ])
  await events.update(event.id, { team: [a.id, b.id, a.id] })
  assert.deepEqual((await events.list())[0].team.sort(), [a.id, b.id].sort())
  await events.update(event.id, { team: [b.id] })
  assert.deepEqual((await events.list())[0].team, [b.id])
  await assert.rejects(events.update(event.id, { team: 'Ben' }), /list of member ids/)
  await events.remove(event.id)
  assert.deepEqual(await events.list(), [])
})

test('event roles must belong to the member and survive adding another member', async () => {
  const { db, events, event } = await setup()
  const [[a], [b]] = await db.apply([
    { op: 'insert', table: 'team_members', row: { name: 'Asha', role: 'Photographer, Editor' } },
    { op: 'insert', table: 'team_members', row: { name: 'Ben', role: 'Photographer' } },
  ])
  await events.update(event.id, { team: [a.id] })
  await events.setTeamRole(event.id, String(a.id), 'Editor')
  await assert.rejects(events.setTeamRole(event.id, String(a.id), 'Designer'), /member’s roles/)
  await events.update(event.id, { team: [a.id, b.id] })
  await events.setTeamRole(event.id, String(b.id), 'Photographer')
  assert.deepEqual((await events.list())[0].team_roles, { [String(a.id)]: 'Editor', [String(b.id)]: 'Photographer' })
})
