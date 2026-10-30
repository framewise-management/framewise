import { ClientCompletion } from '../clients/client-completion.ts'
import type { Change, Database, Row } from '../db/database.ts'
import type { ClientRow, EventRow, ProjectRow } from '../db/rows.ts'
import { HttpError } from '../http/http-error.ts'
import { ProjectStageEdit } from './project-stage-edit.ts'

// production projects are opened by EventService when a shoot completes; here they move through their stages
export class ProjectService {
  static readonly editable = ['stage', 'stage_names', 'completed_stages', 'due', 'owner_id', 'notes'] as const

  readonly #db: Database

  constructor(db: Database) {
    this.#db = db
  }

  async list(): Promise<ProjectRow[]> {
    const [clients, events, projects] = await Promise.all([this.#db.select<ClientRow>('clients'), this.#db.select<EventRow>('events'), this.#db.select<ProjectRow>('projects')])
    const deleted = new Set(clients.filter(c => c.deleted_at).map(c => c.id))
    const hidden = new Set(events.filter(e => deleted.has(e.client_id)).map(e => e.id))
    return projects.filter(p => !hidden.has(p.event_id))
  }

  async update(id: string, patch: Row): Promise<Row> {
    const row = await this.#project(id)
    const set = ProjectStageEdit.apply(row, patch)
    const next = { ...row, ...set } as ProjectRow
    await this.#db.apply([{ op: 'update', table: 'projects', match: { id }, set }, ...(await this.#completion(row.event_id, p => (p.id === id ? next : p)))])
    return (await this.#db.select('projects', { id }))[0]
  }

  async remove(id: string): Promise<void> {
    const row = await this.#project(id)
    await this.#db.apply([{ op: 'delete', table: 'projects', match: { id } }, ...(await this.#completion(row.event_id, p => (p.id === id ? null : p)))])
  }

  // the client's Completed status after this project change
  async #completion(eventId: string, change: (p: ProjectRow) => ProjectRow | null): Promise<Change[]> {
    const [event] = await this.#db.select<EventRow>('events', { id: eventId })
    const [[client], events, projects] = await Promise.all([
      this.#db.select<ClientRow>('clients', { id: event.client_id }),
      this.#db.select<EventRow>('events', { client_id: event.client_id }),
      this.#db.select<ProjectRow>('projects'),
    ])
    return ClientCompletion.changes(client, events, projects.map(change).filter(p => p !== null))
  }

  async #project(id: string): Promise<ProjectRow & { retired_completed_stages: string[] }> {
    const [row] = await this.#db.select<ProjectRow & { retired_completed_stages: string[] }>('projects', { id })
    if (!row) throw new HttpError(404, 'Project not found')
    return row
  }
}
