import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ProductionStages } from '@framewise/shared/production-stages.ts'
import { ClientService } from '../clients/client-service.ts'
import { PgliteDatabase } from '../db/pglite-database.ts'
import type { ClientRow, EventRow, ProjectRow } from '../db/rows.ts'
import { EventService } from '../events/event-service.ts'
import { PackageService } from '../packages/package-service.ts'
import { ProjectService } from './project-service.ts'

test('finishing the last stage completes the client; reopening or deleting the project reverts it', async () => {
  const db = await PgliteDatabase.create()
  const events = new EventService(db, () => '2026-10-24')
  await new ClientService(db, events, new PackageService(db)).create({ name: 'A', status: 'Booked' }, [{ type: 'Wedding', date: '2026-12-10', venue: 'Pune', services: ['Candid'] }])
  const [event] = await db.select<EventRow>('events')
  await events.update(event.id, { status: 'Shoot Completed' })
  const projects = new ProjectService(db)
  const [project] = await projects.list()
  const status = async () => (await db.select<ClientRow>('clients'))[0].status

  const moved = await projects.update(project.id, { stage: 3 })
  assert.deepEqual(moved.completed_stages, ProductionStages.defaults.slice(0, 3))
  await projects.update(project.id, { stage: 14 })
  assert.equal(await status(), 'Completed')
  await projects.update(project.id, { stage: 13 })
  assert.equal(await status(), 'Booked')

  const renamed = await projects.update(project.id, { stage_names: ['Shoot Completed', 'Album Groom', 'Digital Invitation', 'Completed'] })
  assert.deepEqual([renamed.stage, (renamed.retired_completed_stages as string[]).length], [2, 11])
  await assert.rejects(projects.update(project.id, { stage_names: ['Shoot Completed', 'Completed'] }), /Keep the current stage: Digital Invitation/)

  await projects.update(project.id, { stage: 3 })
  assert.equal(await status(), 'Completed')
  await projects.remove(project.id)
  assert.equal(await status(), 'Booked')
  assert.deepEqual(await db.select<ProjectRow>('projects'), [])
})
