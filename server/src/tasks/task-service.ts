import { CalendarDate } from '@framewise/shared/calendar-date.ts'
import type { Database, Row } from '../db/database.ts'
import type { ClientRow, EventRow, ProjectRow, TaskRow } from '../db/rows.ts'
import { HttpError } from '../http/http-error.ts'

export class TaskService {
  static readonly editable = ['title', 'priority', 'due', 'status', 'owner_id', 'client_id', 'event_id', 'project_id', 'notes'] as const

  readonly #db: Database

  constructor(db: Database) {
    this.#db = db
  }

  async list(): Promise<TaskRow[]> {
    const [clients, tasks] = await Promise.all([this.#db.select<ClientRow>('clients'), this.#db.select<TaskRow>('tasks')])
    const deleted = new Set(clients.filter(c => c.deleted_at).map(c => c.id))
    return tasks.filter(t => !t.client_id || !deleted.has(t.client_id))
  }

  async create(input: Row): Promise<Row> {
    const [[created]] = await this.#db.apply([{ op: 'insert', table: 'tasks', row: await this.#linked(input) }])
    return created
  }

  async update(id: string, patch: Row): Promise<Row> {
    const [old] = await this.#db.select<TaskRow>('tasks', { id })
    if (!old) throw new HttpError(404, 'Task not found')
    const next = await this.#linked({ ...old, ...patch })
    const keys = new Set([...Object.keys(patch), 'client_id', 'event_id', 'project_id'])
    const [[updated]] = await this.#db.apply([{ op: 'update', table: 'tasks', match: { id }, set: Object.fromEntries([...keys].map(k => [k, next[k]])) }])
    return updated
  }

  async remove(id: string): Promise<void> {
    await this.#db.apply([{ op: 'delete', table: 'tasks', match: { id } }])
  }

  // legacy taskLinks: a project fixes the event, an event fixes the client, and they must agree
  async #linked(value: Row): Promise<Row> {
    const v: Row = { ...value, project_id: value.project_id || null, event_id: value.event_id || null, client_id: value.client_id || null }
    if (!String(v.title || '').trim()) throw new HttpError(400, 'Enter the task title')
    if (!CalendarDate.parse(v.due as string)) throw new HttpError(400, 'Enter a valid due date')
    const [project] = v.project_id ? await this.#db.select<ProjectRow>('projects', { id: v.project_id as string }) : []
    if (v.project_id && !project) throw new HttpError(400, 'Select an existing project')
    if (project) {
      if (v.event_id && v.event_id !== project.event_id) throw new HttpError(400, 'Task event must belong to the selected project')
      v.event_id = project.event_id
    }
    const [event] = v.event_id ? await this.#db.select<EventRow>('events', { id: v.event_id as string }) : []
    if (v.event_id && !event) throw new HttpError(400, 'Select an existing event')
    if (event) {
      if (v.client_id && v.client_id !== event.client_id) throw new HttpError(400, 'Task client must belong to the selected event')
      v.client_id = event.client_id
    }
    if (v.client_id && !(await this.#db.select('clients', { id: v.client_id as string })).length) throw new HttpError(400, 'Select an existing client')
    return v
  }
}
