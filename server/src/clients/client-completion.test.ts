import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ProductionStages } from '@framewise/shared/production-stages.ts'
import type { Change } from '../db/database.ts'
import type { ClientRow, EventRow, ProjectRow } from '../db/rows.ts'
import { ClientCompletion } from './client-completion.ts'

const { Store } = await import(new URL('../../../legacy/dist/store.js', import.meta.url).href)

const done: Partial<ProjectRow> = { stage: 14, stage_names: [...ProductionStages.defaults], completed_stages: [...ProductionStages.defaults] }
const started: Partial<ProjectRow> = { stage: 1, stage_names: [...ProductionStages.defaults], completed_stages: ['Shoot Completed'] }

test('completion matches legacy syncCompletion', () => {
  const cases: [string, Partial<ClientRow>, Partial<EventRow>[], Partial<ProjectRow>[]][] = [
    ['all shot and finished', { status: 'Booked' }, [{ id: 'e1', status: 'Shoot Completed', booking_status: 'Booked' }, { id: 'e2', status: 'Shoot Completed' }], [{ ...done, event_id: 'e1' }, { ...done, event_id: 'e2' }]],
    ['one project unfinished', { status: 'Booked' }, [{ id: 'e1', status: 'Shoot Completed' }, { id: 'e2', status: 'Shoot Completed' }], [{ ...done, event_id: 'e1' }, { ...started, event_id: 'e2' }]],
    ['canceled event ignored', { status: 'Confirmed' }, [{ id: 'e1', status: 'Shoot Completed' }, { id: 'e2', status: 'Scheduled', booking_status: 'Canceled', booking_override: true }], [{ ...done, event_id: 'e1' }]],
    ['reverts to previous status', { status: 'Completed', completion_previous_status: 'Confirmed' }, [{ id: 'e1', status: 'Scheduled', booking_status: 'Completed' }], []],
    ['reverts to Booked', { status: 'Completed' }, [{ id: 'e1', status: 'Scheduled' }], []],
    ['lost client stays lost', { status: 'Lost' }, [{ id: 'e1', status: 'Shoot Completed' }], [{ ...done, event_id: 'e1' }]],
    ['no events', { status: 'Booked' }, [], []],
  ]
  for (const [name, c, es, ps] of cases) {
    const client = { id: 'c1', completion_previous_status: null, ...c } as ClientRow
    const events = es.map(e => ({ client_id: 'c1', booking_status: null, booking_override: false, ...e }) as EventRow)
    const projects = ps.map((p, i) => ({ id: 'p' + i, ...p }) as ProjectRow)
    assert.deepEqual(applied(client, events, ClientCompletion.changes(client, events, projects)), legacy(client, events, projects), name)
  }
})

// the resulting client status and event booking statuses
function applied(client: ClientRow, events: EventRow[], changes: Change[]) {
  const c = { ...client }
  const es = events.map(e => ({ ...e }))
  for (const ch of changes) {
    if (ch.op !== 'update') continue
    const target = ch.table === 'clients' ? [c] : es.filter(e => e.id === ch.match.id)
    for (const t of target) Object.assign(t, ch.set)
  }
  return { status: c.status, previous: c.completion_previous_status || null, events: es.map(e => e.booking_status || null) }
}

function legacy(client: ClientRow, events: EventRow[], projects: ProjectRow[]) {
  const values = new Map<string, string>()
  const store = new Store({ getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => values.set(k, v) })
  store.data.clients = [{ id: client.id, status: client.status, ...(client.completion_previous_status ? { completionPreviousStatus: client.completion_previous_status } : {}) }]
  store.data.events = events.map(e => ({ id: e.id, client: e.client_id, status: e.status, bookingStatus: e.booking_status || '', bookingOverride: e.booking_override }))
  store.data.projects = projects.map(p => ({ id: p.id, event: p.event_id, stage: p.stage, stageNames: p.stage_names, completedStages: p.completed_stages }))
  store.syncCompletion(client.id)
  const c = store.data.clients[0]
  return { status: c.status, previous: c.completionPreviousStatus || null, events: store.data.events.map((e: { bookingStatus: string }) => e.bookingStatus || null) }
}
