import type { Database, Row } from '../db/database.ts'
import { HttpError } from '../http/http-error.ts'

export interface Term {
  id: string
  title: string
  body: string
  active: boolean
  created_at: string
}

export class TermsService {
  readonly #db: Database
  constructor(db: Database) { this.#db = db }

  async list(): Promise<Term[]> {
    return (await this.#db.select<Term>('terms')).sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))
  }

  async create(input: Row): Promise<Row> {
    const [[term]] = await this.#db.apply([{ op: 'insert', table: 'terms', row: { title: text(input.title, 'title'), body: text(input.body, 'text') } }])
    return term
  }

  async update(id: string, input: Row): Promise<Row> {
    const set: Row = {}
    if ('title' in input) set.title = text(input.title, 'title')
    if ('body' in input) set.body = text(input.body, 'text')
    if ('active' in input) {
      if (typeof input.active !== 'boolean') throw new HttpError(400, 'Invalid clause visibility')
      set.active = input.active
    }
    if (!Object.keys(set).length) throw new HttpError(400, 'No changes provided')
    const [[term]] = await this.#db.apply([{ op: 'update', table: 'terms', match: { id }, set }])
    return term
  }

  async remove(id: string): Promise<void> {
    await this.#db.apply([{ op: 'delete', table: 'terms', match: { id } }])
  }
}

function text(value: unknown, label: string): string {
  const result = typeof value === 'string' ? value.trim() : ''
  if (!result) throw new HttpError(400, `Enter the clause ${label}`)
  return result
}
