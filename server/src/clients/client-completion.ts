import { Booking } from '@framewise/shared/booking.ts'
import { ProductionStages } from '@framewise/shared/production-stages.ts'
import type { Change } from '../db/database.ts'
import type { ClientRow, EventRow, ProjectRow } from '../db/rows.ts'

export class ClientCompletion {
  // a client is Completed once every active event is shot and its project finished; it reverts when that stops being true
  static changes(client: ClientRow, events: readonly EventRow[], projects: readonly ProjectRow[]): Change[] {
    const active = events.filter(e => e.client_id === client.id && !Booking.closed.includes(e.booking_status || client.status))
    const complete = active.length > 0 && active.every(e => e.status === 'Shoot Completed' && projects.some(p => p.event_id === e.id && isFinished(p)))
    if (complete && client.status !== 'Completed' && !Booking.closed.includes(client.status))
      return [
        { op: 'update', table: 'clients', match: { id: client.id }, set: { status: 'Completed', completion_previous_status: client.status } },
        ...followingEvents(active, client.status, 'Completed'),
      ]
    if (!complete && client.status === 'Completed') {
      const status = client.completion_previous_status || 'Booked'
      return [
        { op: 'update', table: 'clients', match: { id: client.id }, set: { status, completion_previous_status: null } },
        ...followingEvents(active, 'Completed', status),
      ]
    }
    return []
  }
}

function isFinished(p: ProjectRow): boolean {
  return ProductionStages.isComplete({ stage: p.stage, stageNames: p.stage_names, completedStages: p.completed_stages })
}

// events that follow the client's status (not overridden) move with it
function followingEvents(events: readonly EventRow[], from: string, to: string): Change[] {
  return events
    .filter(e => !e.booking_override && e.booking_status === from)
    .map(e => ({ op: 'update', table: 'events', match: { id: e.id }, set: { booking_status: to } }))
}
