import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ClientService } from '../clients/client-service.ts'
import { PgliteDatabase } from '../db/pglite-database.ts'
import type { EventRow, EventTeamRow } from '../db/rows.ts'
import { EventService } from '../events/event-service.ts'
import { PackageService } from '../packages/package-service.ts'
import { TeamService } from './team-service.ts'

async function setup() {
  const db = await PgliteDatabase.create()
  const events = new EventService(db, () => '2026-10-24')
  await new ClientService(db, events, new PackageService(db)).create({ name: 'A' }, [{ type: 'Wedding', date: '2026-12-10', venue: 'Pune', services: ['Candid'] }])
  const [event] = await db.select<EventRow>('events')
  const team = new TeamService(db)
  const asha = await team.addMember({ name: ' Asha ', role: 'Photographer', phone: '+91 98765 43210' })
  const ben = await team.addMember({ name: 'Ben', phone: '' })
  return { db, team, event, asha: asha.id as string, ben: ben.id as string }
}

test('assignments put the member on the crew and follow the legacy duplicate rules', async () => {
  const { db, team, event, asha, ben } = await setup()
  assert.equal((await team.members())[0].name, 'Asha')
  const a = await team.assign({ event_id: event.id, member_id: asha, service: 'Candid', charge: 8000, paid: 0 })
  assert.deepEqual((await db.select<EventTeamRow>('event_team')).map(t => t.member_id), [asha])
  await assert.rejects(team.assign({ event_id: event.id, member_id: ben, service: ' candid ', charge: 0, paid: 0 }), /already has a team member/)
  await assert.rejects(team.assign({ event_id: event.id, member_id: asha, service: 'Drone', charge: 0, paid: 0 }), /already assigned to this event/)
  const twin = await team.addMember({ name: 'A. Kulkarni', phone: '9876543210' })
  await assert.rejects(team.assign({ event_id: event.id, member_id: twin.id, service: 'Drone', charge: 0, paid: 0 }), /already assigned to this event/)
  await assert.rejects(team.assign({ event_id: event.id, member_id: ben, service: 'Drone', charge: 100, paid: 101 }), /between zero and the agreed charge/)
  await assert.rejects(team.assign({ event_id: event.id, member_id: ben, service: ' ', charge: 0, paid: 0 }), /Select an event, service and team member/)

  await team.updateAssignment(a.id as string, { member_id: ben })
  assert.deepEqual((await db.select<EventTeamRow>('event_team')).map(t => t.member_id), [ben])
  await assert.rejects(team.updateAssignment(a.id as string, { event_id: crypto.randomUUID() }), /original event/)
  await assert.rejects(team.removeMember(ben), /Reassign financial assignments/)
  await team.unassign(a.id as string)
  assert.deepEqual(await db.select('event_team'), [])
})

test('members without money on their assignments can be removed with them', async () => {
  const { db, team, event, asha } = await setup()
  await team.assign({ event_id: event.id, member_id: asha, service: 'Candid', charge: 0, paid: 0 })
  await team.removeMember(asha)
  assert.deepEqual(await db.select('assignments'), [])
  assert.equal((await team.members()).length, 1)
  await assert.rejects(team.addMember({ name: '' }), /team member name/)
})
