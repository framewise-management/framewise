import { DeliveryItems, type DeliveryItem } from '@framewise/shared/delivery-items.ts'
import { Pricing } from '@framewise/shared/pricing.ts'
import type { Change, Database, Row } from '../db/database.ts'
import type { ClientRow, DeliveryItemRow, EventRow, PackageRow, PaymentRow } from '../db/rows.ts'
import { HttpError } from '../http/http-error.ts'
import { DeliveryEdits, type ItemEdit, type StatusEdit } from './delivery-edits.ts'

export interface PackageInput {
  name?: string
  price?: number
  discount?: number
  events?: string[]
  deliverables?: string | string[]
  complimentary?: string | string[]
  bill_to?: string | null
  invoice_reference?: string | null
  invoice_terms?: string | null
  invoice_notes?: string | null
}

// what one client already has, for planning a package change
export interface PackageContext {
  clientId: string
  row?: PackageRow
  events: readonly EventRow[]
  packages: readonly PackageRow[]
  payments: readonly PaymentRow[]
  items: readonly DeliveryItemRow[]
}

export interface PackageView extends PackageRow {
  events: string[]
  items: DeliveryItemRow[]
}

export class PackageService {
  static readonly editable = ['name', 'price', 'discount', 'events', 'deliverables', 'complimentary', 'bill_to', 'invoice_reference', 'invoice_terms', 'invoice_notes'] as const

  readonly #db: Database

  constructor(db: Database) {
    this.#db = db
  }

  async list(): Promise<PackageView[]> {
    const [clients, packages, events, items] = await Promise.all([
      this.#db.select<ClientRow>('clients'), this.#db.select<PackageRow>('packages'), this.#db.select<EventRow>('events'), this.#db.select<DeliveryItemRow>('delivery_items'),
    ])
    const deleted = new Set(clients.filter(c => c.deleted_at).map(c => c.id))
    return packages.filter(p => !deleted.has(p.client_id)).map(p => view(p, events, items))
  }

  async create(clientId: string, input: PackageInput): Promise<PackageView> {
    const [client] = await this.#db.select<ClientRow>('clients', { id: clientId })
    if (!client || client.deleted_at) throw new HttpError(404, 'Client not found')
    const { id, changes } = this.packageChanges(await this.#context(clientId), input)
    await this.#db.apply(changes)
    return this.#view(id)
  }

  async update(id: string, input: PackageInput): Promise<PackageView> {
    const row = await this.#package(id)
    const { changes } = this.packageChanges({ ...(await this.#context(row.client_id)), row }, input)
    await this.#db.apply(changes)
    return this.#view(id)
  }

  // legacy savePackage: links event days, keeps receipts covered, and rebuilds delivery items from the text lines
  packageChanges(ctx: PackageContext, input: PackageInput): { id: string; changes: Change[] } {
    const { row } = ctx
    const id = row?.id ?? crypto.randomUUID()
    const eventIds = input.events ?? ctx.events.filter(e => row && e.package_id === row.id).map(e => e.id)
    if (eventIds.some(eid => !ctx.events.some(e => e.id === eid && e.client_id === ctx.clientId))) throw new HttpError(400, 'Package events must belong to this client')
    if (ctx.events.some(e => e.package_id && e.package_id !== id && eventIds.includes(e.id))) throw new HttpError(400, 'An event already belongs to another package')
    const price = Number(input.price ?? row?.price ?? 0)
    const discount = Number(input.discount ?? row?.discount ?? 0)
    const total = checkedQuote(price, discount)
    if (row && total < ctx.payments.filter(p => p.package_id === id).reduce((n, p) => n + p.amount, 0)) throw new HttpError(400, 'Package quotation cannot be below its receipts')
    const name = String(input.name ?? row?.name ?? '').trim()
    if (!name) throw new HttpError(400, 'Enter a package name')
    const first = !row && !ctx.packages.length
    const unpackaged = ctx.payments.filter(p => !p.package_id)
    if (first && unpackaged.some(p => p.event_id && !eventIds.includes(p.event_id))) throw new HttpError(400, 'Include events with existing receipts in the first package')

    const fields: Row = { name, price, discount }
    for (const k of ['bill_to', 'invoice_reference', 'invoice_terms', 'invoice_notes'] as const) if (k in input) fields[k] = input[k]
    const changes: Change[] = [row
      ? { op: 'update', table: 'packages', match: { id }, set: fields }
      : { op: 'insert', table: 'packages', row: { id, client_id: ctx.clientId, ...fields } }]
    for (const e of ctx.events) {
      if (eventIds.includes(e.id) && e.package_id !== id) changes.push({ op: 'update', table: 'events', match: { id: e.id }, set: { package_id: id } })
      if (!eventIds.includes(e.id) && row && e.package_id === id) changes.push({ op: 'update', table: 'events', match: { id: e.id }, set: { package_id: null } })
    }
    if (!row || input.deliverables !== undefined || input.complimentary !== undefined) changes.push(...lineChanges(id, ctx.items, input))
    // the first package takes over the client's earlier receipts
    if (first) for (const p of unpackaged) changes.push({ op: 'update', table: 'payments', match: { id: p.id }, set: { package_id: id } })
    return { id, changes }
  }

  async saveItems(id: string, edits: ItemEdit[]): Promise<PackageView> {
    await this.#package(id)
    const previous = await this.#activeItems(id)
    const { items, retired } = DeliveryEdits.items(previous, edits)
    const now = new Date().toISOString()
    await this.#db.apply([
      ...items.map((i): Change => {
        const { id: itemId, ...set } = i
        return itemId ? { op: 'update', table: 'delivery_items', match: { id: itemId }, set } : { op: 'insert', table: 'delivery_items', row: { package_id: id, ...set } }
      }),
      ...retired.map((itemId): Change => ({ op: 'update', table: 'delivery_items', match: { id: itemId }, set: { retired_at: now } })),
    ])
    return this.#view(id)
  }

  async updateDelivery(id: string, update: { drive_link?: string | null; items?: StatusEdit[] }): Promise<PackageView> {
    await this.#package(id)
    if (update.drive_link && !/^https:\/\//.test(update.drive_link)) throw new HttpError(400, 'Use a secure https link')
    const items = await this.#activeItems(id)
    const changes: Change[] = []
    if ('drive_link' in update) changes.push({ op: 'update', table: 'packages', match: { id }, set: { drive_link: update.drive_link || null } })
    for (const edit of update.items ?? []) {
      const item = items.find(i => i.id === edit.id)
      if (!item) throw new HttpError(400, 'Invalid delivery item identity')
      changes.push({ op: 'update', table: 'delivery_items', match: { id: item.id }, set: DeliveryEdits.status(item, edit) })
    }
    if (changes.length) await this.#db.apply(changes)
    return this.#view(id)
  }

  async #context(clientId: string): Promise<PackageContext> {
    const [events, packages, payments] = await Promise.all([
      this.#db.select<EventRow>('events', { client_id: clientId }),
      this.#db.select<PackageRow>('packages', { client_id: clientId }),
      this.#db.select<PaymentRow>('payments', { client_id: clientId }),
    ])
    const items = (await Promise.all(packages.map(p => this.#activeItems(p.id)))).flat()
    return { clientId, events, packages, payments, items }
  }

  async #package(id: string): Promise<PackageRow> {
    const [row] = await this.#db.select<PackageRow>('packages', { id })
    if (!row) throw new HttpError(404, 'Package not found')
    return row
  }

  async #activeItems(packageId: string): Promise<DeliveryItemRow[]> {
    return (await this.#db.select<DeliveryItemRow>('delivery_items', { package_id: packageId })).filter(i => !i.retired_at).sort((a, b) => a.position - b.position)
  }

  async #view(id: string): Promise<PackageView> {
    const row = await this.#package(id)
    const [events, items] = await Promise.all([this.#db.select<EventRow>('events', { package_id: id }), this.#db.select<DeliveryItemRow>('delivery_items', { package_id: id })])
    return view(row, events, items)
  }
}

function view(p: PackageRow, events: readonly EventRow[], items: readonly DeliveryItemRow[]): PackageView {
  return {
    ...p,
    events: events.filter(e => e.package_id === p.id).map(e => e.id),
    items: items.filter(i => i.package_id === p.id && !i.retired_at).sort((a, b) => a.position - b.position),
  }
}

function checkedQuote(price: number, discount: number): number {
  try {
    return Pricing.finalQuote(price, discount)
  } catch (e) {
    throw new HttpError(400, (e as Error).message)
  }
}

// deliverable/complimentary text lines become item rows; matching items keep their id and status, dropped ones retire
function lineChanges(packageId: string, all: readonly DeliveryItemRow[], input: PackageInput): Change[] {
  const previous = all.filter(i => i.package_id === packageId)
  const current = previous.map((i): DeliveryItem => ({ id: i.id, kind: i.kind, label: i.label, status: i.status, quantity: i.quantity, duration: i.duration ?? undefined }))
  const synced = DeliveryItems.sync({
    deliverables: input.deliverables ?? DeliveryItems.ofPackage({ delivery: { items: current } }, 'deliverable'),
    complimentary: input.complimentary ?? DeliveryItems.ofPackage({ delivery: { items: current } }, 'complimentary'),
  }, current)
  const now = new Date().toISOString()
  return [
    ...synced.items.map((i, position): Change => previous.some(p => p.id === i.id)
      ? { op: 'update', table: 'delivery_items', match: { id: i.id }, set: { kind: i.kind, label: i.label, position } }
      : { op: 'insert', table: 'delivery_items', row: { id: i.id, package_id: packageId, kind: i.kind, label: i.label, position, status: i.status } }),
    ...synced.retired.map((i): Change => ({ op: 'update', table: 'delivery_items', match: { id: i.id }, set: { retired_at: now } })),
  ]
}
