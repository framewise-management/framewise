import { CalendarDate } from '@framewise/shared/calendar-date.ts'
import type { Database, Row } from '../db/database.ts'
import type { ClientRow, EventRow, ExpenseRow } from '../db/rows.ts'
import { HttpError } from '../http/http-error.ts'

export class ExpenseService {
  static readonly editable = ['title', 'amount', 'spent_on', 'source_date_unknown', 'category', 'client_id', 'event_id', 'vendor', 'method'] as const

  readonly #db: Database

  constructor(db: Database) {
    this.#db = db
  }

  async list(): Promise<ExpenseRow[]> {
    const [clients, expenses] = await Promise.all([this.#db.select<ClientRow>('clients'), this.#db.select<ExpenseRow>('expenses')])
    const deleted = new Set(clients.filter(c => c.deleted_at).map(c => c.id))
    return expenses.filter(x => !x.client_id || !deleted.has(x.client_id))
  }

  async create(input: Row): Promise<Row> {
    const [[created]] = await this.#db.apply([{ op: 'insert', table: 'expenses', row: await this.#checked(input) }])
    return created
  }

  async update(id: string, patch: Row): Promise<Row> {
    const [old] = await this.#db.select<ExpenseRow>('expenses', { id })
    if (!old) throw new HttpError(404, 'Expense not found')
    const next: Row = { ...old, ...patch }
    if ('spent_on' in patch) next.source_date_unknown = !next.spent_on
    const checked = await this.#checked(next)
    const keys = [...Object.keys(patch), ...('spent_on' in patch ? ['source_date_unknown'] : [])]
    const [[updated]] = await this.#db.apply([{ op: 'update', table: 'expenses', match: { id }, set: Object.fromEntries(keys.map(k => [k, checked[k]])) }])
    return updated
  }

  async remove(id: string): Promise<void> {
    await this.#db.apply([{ op: 'delete', table: 'expenses', match: { id } }])
  }

  async #checked(v: Row): Promise<Row> {
    const title = String(v.title || '').trim()
    if (!title) throw new HttpError(400, 'Enter the expense title')
    const amount = Number(v.amount)
    if (!Number.isFinite(amount) || amount < 0) throw new HttpError(400, 'Enter a valid amount')
    if (!v.source_date_unknown && !CalendarDate.parse(v.spent_on as string)) throw new HttpError(400, 'Enter the expense date')
    if (v.event_id) {
      const [event] = await this.#db.select<EventRow>('events', { id: v.event_id as string })
      if (!event || event.client_id !== v.client_id) throw new HttpError(400, 'Select an event belonging to this client')
    }
    return { ...v, title, amount, client_id: v.client_id || null, event_id: v.event_id || null, spent_on: v.spent_on || null, source_date_unknown: !!v.source_date_unknown }
  }
}
