import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ClientService } from '../clients/client-service.ts'
import { PgliteDatabase } from '../db/pglite-database.ts'
import type { EventRow, ProjectRow } from '../db/rows.ts'
import { EventService } from '../events/event-service.ts'
import { PackageService } from '../packages/package-service.ts'
import { TaskService } from './task-service.ts'

test('task links fill in from the project down to the client and must agree', async () => {
  const db = await PgliteDatabase.create()
  const events = new EventService(db, () => '2026-10-24')
  const clients = new ClientService(db, events, new PackageService(db))
  const day = { type: 'Wedding', date: '2026-12-10', venue: 'Pune', services: ['Candid'] }
  const a = await clients.create({ name: 'A' }, [day])
  const b = await clients.create({ name: 'B' }, [day])
  const [eventOfA] = await db.select<EventRow>('events', { client_id: a.id as string })
  const [eventOfB] = await db.select<EventRow>('events', { client_id: b.id as string })
  await events.update(eventOfA.id, { status: 'Shoot Completed' })
  const [project] = await db.select<ProjectRow>('projects')
  const tasks = new TaskService(db)

  const t = await tasks.create({ title: 'Send album proofs', due: '2026-12-20', priority: 'High', project_id: project.id })
  assert.deepEqual([t.event_id, t.client_id], [eventOfA.id, a.id])
  await assert.rejects(tasks.create({ title: 'X', due: '2026-12-20', project_id: project.id, event_id: eventOfB.id }), /must belong to the selected project/)
  await assert.rejects(tasks.create({ title: 'X', due: '2026-12-20', event_id: eventOfA.id, client_id: b.id }), /must belong to the selected event/)
  await assert.rejects(tasks.create({ title: 'X', due: '2026-12-20', project_id: crypto.randomUUID() }), /existing project/)
  await assert.rejects(tasks.create({ title: 'X', due: '20-12-2026' }), /valid due date/)
  await assert.rejects(tasks.create({ title: '', due: '2026-12-20' }), /task title/)

  const general = await tasks.create({ title: 'Backup drives', due: '2026-12-01' })
  assert.equal(general.client_id, null)
  const moved = await tasks.update(general.id as string, { event_id: eventOfB.id, status: 'In progress' })
  assert.deepEqual([moved.client_id, moved.status], [b.id, 'In progress'])
  await clients.remove(b.id as string)
  assert.deepEqual((await tasks.list()).map(x => x.title), ['Send album proofs'])
  await tasks.remove(t.id as string)
})
