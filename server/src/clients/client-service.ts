import { CalendarDate } from '@framewise/shared/calendar-date.ts'
import { PaymentStages } from '@framewise/shared/payment-stages.ts'
import { Pricing } from '@framewise/shared/pricing.ts'
import type { Change, Database, Row } from '../db/database.ts'
import type { ClientRow, EventRow, PackageRow } from '../db/rows.ts'
import type { DayInput, EventService } from '../events/event-service.ts'
import { HttpError } from '../http/http-error.ts'
import type { PackageService } from '../packages/package-service.ts'

export interface PackagePlan {
  name?: string
  price?: number
  discount?: number
  day_indexes?: number[]
  deliverables?: string | string[]
  complimentary?: string | string[]
  booking_amount?: number
  payment_date?: string
  method?: string
}

export class ClientService {
  static readonly editable = ['name', 'bride', 'groom', 'phone', 'email', 'address', 'lead_source', 'budget', 'wedding_date', 'package_name',
    'price', 'discount', 'finance_mode', 'status', 'due', 'notes'] as const

  readonly #db: Database
  readonly #events: EventService
  readonly #packages: PackageService

  constructor(db: Database, events: EventService, packages: PackageService) {
    this.#db = db
    this.#events = events
    this.#packages = packages
  }

  async list(): Promise<ClientRow[]> {
    return (await this.#db.select<ClientRow>('clients')).filter(c => !c.deleted_at).sort(byOrder)
  }

  async deleted(): Promise<ClientRow[]> {
    return (await this.#db.select<ClientRow>('clients')).filter(c => c.deleted_at)
  }

  // a new client always comes with its event days; the quote falls back to the days' prices
  async create(client: Row, days: DayInput[]): Promise<Row> {
    const name = String(client.name || '').trim()
    if (!name) throw new HttpError(400, 'Enter a client name')
    const price = Number(client.price || 0) || days.reduce((n, d) => n + Number(d.price || 0), 0)
    const discount = Number(client.discount || 0) || (!Number(client.price || 0) ? days.reduce((n, d) => n + Number(d.discount || 0), 0) : 0)
    checkedQuote(price, discount)
    const row = { ...client, id: crypto.randomUUID(), name, price, discount, finance_mode: (client.finance_mode || 'Shared') as ClientRow['finance_mode'] }
    const [[created]] = await this.#db.apply([
      { op: 'insert', table: 'clients', row },
      ...this.#events.dayChanges(row, false, days),
    ])
    return created
  }

  // legacy createPackagedClient: every day belongs to exactly one package, each package may carry its booking receipt
  async createPackaged(client: Row, days: DayInput[], plans: PackagePlan[]): Promise<Row> {
    if (!Array.isArray(plans) || !plans.length) throw new HttpError(400, 'Create at least one package')
    const linked = new Set<number>()
    for (const p of plans) {
      if (!p.name?.trim() || !p.day_indexes?.length) throw new HttpError(400, 'Give each package a name and linked event days')
      const total = checkedQuote(Number(p.price || 0), Number(p.discount || 0))
      for (const i of p.day_indexes) {
        if (!Number.isInteger(i) || i < 0 || i >= days.length || linked.has(i)) throw new HttpError(400, 'Each event must belong to exactly one package')
        linked.add(i)
      }
      const booking = Number(p.booking_amount || 0)
      if (!Number.isFinite(booking) || booking < 0 || booking > total) throw new HttpError(400, 'Booking receipt must be within package value')
      if (booking > 0 && !CalendarDate.parse(p.payment_date)) throw new HttpError(400, 'Enter the actual booking payment date')
    }
    if (linked.size !== days.length) throw new HttpError(400, 'Link every event to a package')
    const name = String(client.name || '').trim()
    if (!name) throw new HttpError(400, 'Enter a client name')

    const row = {
      ...client, id: crypto.randomUUID(), name, finance_mode: 'Shared' as const,
      price: plans.reduce((n, p) => n + Number(p.price || 0), 0),
      discount: plans.reduce((n, p) => n + Number(p.discount || 0), 0),
      package_name: plans.length === 1 ? plans[0].name!.trim() : 'Multiple packages',
    }
    const dayChanges = this.#events.dayChanges(row, false, days.map(d => ({ ...d, price: 0, discount: 0, booking_amount: 0 })))
    const events = dayChanges.flatMap(c => (c.op === 'insert' && c.table === 'events' ? [{ ...c.row, package_id: null } as unknown as EventRow] : []))
    const changes: Change[] = [{ op: 'insert', table: 'clients', row }, ...dayChanges]
    const packages: PackageRow[] = []
    for (const plan of plans) {
      const planned = this.#packages.packageChanges(
        { clientId: row.id, events, packages, payments: [], items: [] },
        { name: plan.name, price: Number(plan.price || 0), discount: Number(plan.discount || 0), events: plan.day_indexes!.map(i => events[i].id), deliverables: plan.deliverables ?? [], complimentary: plan.complimentary ?? [] },
      )
      packages.push({ id: planned.id, client_id: row.id } as PackageRow)
      changes.push(...planned.changes)
      if (Number(plan.booking_amount || 0) > 0)
        changes.push({ op: 'insert', table: 'payments', row: {
          client_id: row.id, package_id: planned.id, amount: Number(plan.booking_amount), paid_on: plan.payment_date,
          stage: PaymentStages.name('Booking'), method: plan.method || 'UPI',
        } })
    }
    const [[created]] = await this.#db.apply(changes)
    return created
  }

  async update(id: string, patch: Row): Promise<Row> {
    const client = await this.#client(id)
    const [packages, events] = await Promise.all([this.#db.select('packages', { client_id: id }), this.#db.select<EventRow>('events', { client_id: id })])
    if (packages.length && (['price', 'discount', 'finance_mode'] as const).some(k => k in patch && String(patch[k]) !== String(client[k])))
      throw new HttpError(400, 'Edit quotation in the package card')
    if ('price' in patch || 'discount' in patch) checkedQuote(Number(patch.price ?? client.price), Number(patch.discount ?? client.discount))
    if ('name' in patch && !String(patch.name || '').trim()) throw new HttpError(400, 'Enter a client name')

    const changes: Change[] = [{ op: 'update', table: 'clients', match: { id }, set: patch }]
    if ('status' in patch && patch.status !== client.status)
      changes.push({ op: 'update', table: 'events', match: { client_id: id, booking_override: false, booking_status: client.status }, set: { booking_status: patch.status }, optional: true })
    if ('wedding_date' in patch) changes.push(...weddingDateChanges(client, events, patch.wedding_date as string | null))
    const [[updated]] = await this.#db.apply(changes)
    return updated
  }

  // clients are never hard-deleted; restore brings back everything linked to them
  async remove(id: string): Promise<void> {
    await this.#client(id)
    await this.#db.apply([{ op: 'update', table: 'clients', match: { id }, set: { deleted_at: new Date().toISOString() } }])
  }

  async restore(id: string): Promise<void> {
    const [client] = await this.#db.select<ClientRow>('clients', { id })
    if (!client?.deleted_at) throw new HttpError(404, 'Deleted client not found')
    await this.#db.apply([{ op: 'update', table: 'clients', match: { id }, set: { deleted_at: null } }])
  }

  async reorder(ids: string[]): Promise<void> {
    const current = (await this.list()).map(c => c.id)
    if (ids.length !== current.length || new Set(ids).size !== ids.length || ids.some(id => !current.includes(id))) throw new HttpError(400, 'Invalid client order')
    await this.#db.apply(ids.map((id, i) => ({ op: 'update', table: 'clients', match: { id }, set: { sort_order: i } })))
  }

  async #client(id: string): Promise<ClientRow> {
    const [client] = await this.#db.select<ClientRow>('clients', { id })
    if (!client || client.deleted_at) throw new HttpError(404, 'Client not found')
    return client
  }
}

function byOrder(a: ClientRow, b: ClientRow): number {
  return (a.sort_order ?? Infinity) - (b.sort_order ?? Infinity) || a.code.localeCompare(b.code)
}

function checkedQuote(price: number, discount: number): number {
  try {
    return Pricing.finalQuote(price, discount)
  } catch (e) {
    throw new HttpError(400, (e as Error).message)
  }
}

// the client's wedding date mirrors its single Wedding event; with several weddings each is edited on its event
function weddingDateChanges(client: ClientRow, events: readonly EventRow[], value: string | null): Change[] {
  if (value && !CalendarDate.parse(value)) throw new HttpError(400, 'Enter a valid wedding date')
  const weddings = events.filter(e => e.type === 'Wedding')
  const current = weddings.length ? weddings.map(e => e.event_date).filter(Boolean).sort()[0] || null : client.wedding_date
  if (weddings.length > 1 && (value || null) !== current) throw new HttpError(400, 'Edit each wedding date in Events')
  return weddings.length === 1 ? [{ op: 'update', table: 'events', match: { id: weddings[0].id }, set: { event_date: value || null } }] : []
}
