import { Pricing } from '@framewise/shared/pricing.ts'
import type { Database, Row } from '../db/database.ts'
import type { EnquiryRow } from '../db/rows.ts'
import { HttpError } from '../http/http-error.ts'

export class EnquiryService {
  static readonly editable = ['name', 'bride', 'groom', 'phone', 'email', 'city', 'lead_source', 'budget', 'wedding_date', 'followup',
    'package_name', 'price', 'discount', 'status', 'notes'] as const

  readonly #db: Database

  constructor(db: Database) {
    this.#db = db
  }

  list(): Promise<EnquiryRow[]> {
    return this.#db.select<EnquiryRow>('enquiries')
  }

  async create(row: Row): Promise<Row> {
    check(row, { price: 0, discount: 0 })
    const [[created]] = await this.#db.apply([{ op: 'insert', table: 'enquiries', row: { ...row, name: String(row.name || '').trim() } }])
    return created
  }

  async update(id: string, patch: Row): Promise<Row> {
    const q = await this.#enquiry(id)
    check({ name: q.name, ...patch }, q)
    const [[updated]] = await this.#db.apply([{ op: 'update', table: 'enquiries', match: { id }, set: patch }])
    return updated
  }

  async remove(id: string): Promise<void> {
    await this.#db.apply([{ op: 'delete', table: 'enquiries', match: { id } }])
  }

  // a confirmed enquiry becomes a client once; converting again returns that client
  async convert(id: string): Promise<Row> {
    const q = await this.#enquiry(id)
    if (q.client_id) return (await this.#db.select('clients', { id: q.client_id }))[0]
    if (!['Confirmed', 'Booked'].includes(q.status)) throw new HttpError(400, 'Confirm the enquiry first')
    const client = {
      id: crypto.randomUUID(), name: q.name, bride: q.bride, groom: q.groom, lead_source: q.lead_source, budget: q.budget,
      price: q.price, discount: q.discount, phone: q.phone, email: q.email, address: q.city, wedding_date: q.wedding_date,
      package_name: q.package_name, status: 'Confirmed', notes: q.notes, due: q.followup,
    }
    const [[created]] = await this.#db.apply([
      { op: 'insert', table: 'clients', row: client },
      { op: 'update', table: 'enquiries', match: { id }, set: { client_id: client.id } },
    ])
    return created
  }

  async #enquiry(id: string): Promise<EnquiryRow> {
    const [q] = await this.#db.select<EnquiryRow>('enquiries', { id })
    if (!q) throw new HttpError(404, 'Enquiry not found')
    return q
  }
}

function check(row: Row, current: { price: number; discount: number }): void {
  if (!String(row.name || '').trim()) throw new HttpError(400, 'Enter the enquiry name')
  try {
    Pricing.finalQuote(Number(row.price ?? current.price), Number(row.discount ?? current.discount))
  } catch (e) {
    throw new HttpError(400, (e as Error).message)
  }
}
