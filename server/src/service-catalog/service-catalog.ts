import type { Database, Row } from '../db/database.ts'
import { HttpError } from '../http/http-error.ts'

export interface CatalogService {
  id: string
  name: string
  tag: string | null
  price: number
  active: boolean
  created_at: string
}

// the studio's services, managed under Setup
export class ServiceCatalog {
  static readonly editable = ['name', 'tag', 'price', 'active'] as const

  readonly #db: Database

  constructor(db: Database) {
    this.#db = db
  }

  async list(): Promise<CatalogService[]> {
    return (await this.#db.select<CatalogService>('services')).sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
  }

  async create(input: Row): Promise<Row> {
    const row = { ...changes(input), name: name(input.name) }
    const [[created]] = await this.#db.apply([{ op: 'insert', table: 'services', row }])
    return created
  }

  async update(id: string, input: Row): Promise<Row> {
    const set = changes(input)
    if (!Object.keys(set).length) throw new HttpError(400, 'No changes provided')
    const [[updated]] = await this.#db.apply([{ op: 'update', table: 'services', match: { id }, set }])
    return updated
  }

  async remove(id: string): Promise<void> {
    await this.#db.apply([{ op: 'delete', table: 'services', match: { id } }])
  }
}

function changes(input: Row): Row {
  const set: Row = {}
  if ('name' in input) set.name = name(input.name)
  if ('tag' in input) {
    if (input.tag !== null && typeof input.tag !== 'string') throw new HttpError(400, 'Invalid service tag')
    set.tag = typeof input.tag === 'string' ? input.tag.trim() || null : null
  }
  if ('price' in input) {
    if (typeof input.price !== 'number' || !Number.isFinite(input.price) || input.price < 0) throw new HttpError(400, 'Enter a service price of zero or more')
    set.price = input.price
  }
  if ('active' in input) {
    if (typeof input.active !== 'boolean') throw new HttpError(400, 'Invalid service visibility')
    set.active = input.active
  }
  return set
}

function name(value: unknown): string {
  const result = typeof value === 'string' ? value.trim() : ''
  if (!result) throw new HttpError(400, 'Enter the service name')
  return result
}
