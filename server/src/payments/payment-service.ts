import { CalendarDate } from '@framewise/shared/calendar-date.ts'
import { PaymentStages } from '@framewise/shared/payment-stages.ts'
import { Pricing } from '@framewise/shared/pricing.ts'
import type { Change, Database, Row } from '../db/database.ts'
import type { ClientRow, EventRow, PackageRow, PaymentRow, StagePlanRow } from '../db/rows.ts'
import { HttpError } from '../http/http-error.ts'

// payments are never deleted; edits are corrections and the database keeps an audit row for each
export class PaymentService {
  static readonly editable = ['client_id', 'event_id', 'package_id', 'amount', 'paid_on', 'source_date_unknown', 'stage', 'method',
    'transaction_reference', 'reference', 'invoice_requested', 'notes'] as const

  readonly #db: Database

  constructor(db: Database) {
    this.#db = db
  }

  async list(): Promise<PaymentRow[]> {
    const [clients, payments] = await Promise.all([this.#db.select<ClientRow>('clients'), this.#db.select<PaymentRow>('payments')])
    const deleted = new Set(clients.filter(c => c.deleted_at).map(c => c.id))
    return payments.filter(p => !deleted.has(p.client_id))
  }

  async create(input: Row): Promise<Row> {
    const row = await this.#checked(input, null)
    const [[created]] = await this.#db.apply([{ op: 'insert', table: 'payments', row }])
    return created
  }

  async edit(id: string, patch: Row): Promise<Row> {
    const [old] = await this.#db.select<PaymentRow>('payments', { id })
    if (!old) throw new HttpError(404, 'Payment not found')
    const next: Row = { ...old, ...patch }
    if ('paid_on' in patch) next.source_date_unknown = !next.paid_on
    const checked = await this.#checked(next, id)
    const keys = Object.keys(patch)
    if ('paid_on' in patch) keys.push('source_date_unknown')
    const set = Object.fromEntries(keys.map(k => [k, checked[k]]))
    const [[updated]] = await this.#db.apply([{ op: 'update', table: 'payments', match: { id }, set }])
    return updated
  }

  async stagePlans(): Promise<StagePlanRow[]> {
    return this.#db.select<StagePlanRow>('payment_stage_plans')
  }

  // replaces one client's expected amount per stage; the targets together can't exceed the quote
  async setStagePlan(clientId: string, plan: Record<string, unknown>): Promise<StagePlanRow[]> {
    const client = await this.#client(clientId)
    const targets = new Map<string, number>()
    for (const [stage, value] of Object.entries(plan)) {
      const name = PaymentStages.name(stage)
      const amount = Number(value)
      if (!stage.trim() || value === null || value === '' || !Number.isFinite(amount) || amount < 0) throw new HttpError(400, 'Enter valid stage amounts')
      targets.set(name, amount)
    }
    const { quote } = await this.#money(client, null)
    if ([...targets.values()].reduce((n, v) => n + v, 0) > quote) throw new HttpError(400, 'Stage targets cannot exceed the quotation')
    await this.#db.apply([
      { op: 'delete', table: 'payment_stage_plans', match: { client_id: clientId }, optional: true },
      ...[...targets].map(([stage, target]): Change => ({ op: 'insert', table: 'payment_stage_plans', row: { client_id: clientId, stage, target } })),
    ])
    return this.#db.select<StagePlanRow>('payment_stage_plans', { client_id: clientId })
  }

  // legacy Store.payment: the right package, the right event, and within every balance that applies
  async #checked(v: Row, excludeId: string | null): Promise<Row> {
    const client = await this.#client(String(v.client_id || ''))
    const { quote, paid, packages, events, payments } = await this.#money(client, excludeId)
    const amount = Number(v.amount)
    const event = v.event_id ? events.find(e => e.id === v.event_id) : null
    if (packages.length) {
      const p = packages.find(x => x.id === v.package_id)
      if (!p) throw new HttpError(400, 'Select the payment package')
      if (v.event_id && event?.package_id !== p.id) throw new HttpError(400, 'Event does not belong to this package')
      const received = payments.filter(x => x.package_id === p.id).reduce((n, x) => n + x.amount, 0)
      if (amount > Pricing.finalQuote(p.price, p.discount) - received) throw new HttpError(400, 'Payment exceeds the package balance')
    } else if (v.package_id) {
      throw new HttpError(400, 'Select the payment package')
    }
    if (!Number.isFinite(amount) || amount <= 0 || amount > quote - paid) throw new HttpError(400, 'Enter a positive payment within the outstanding balance')
    if (v.event_id) {
      if (!event) throw new HttpError(400, 'Select an event belonging to this client')
      const eventPaid = payments.filter(x => x.event_id === event.id).reduce((n, x) => n + x.amount, 0)
      if (!packages.length && client.finance_mode === 'Per day' && amount > Number(event.quotation || 0) - eventPaid) throw new HttpError(400, 'Payment exceeds the event balance')
    }
    if (!v.source_date_unknown && !CalendarDate.parse(v.paid_on as string)) throw new HttpError(400, 'Enter the payment date')
    return { ...v, amount, event_id: v.event_id || null, package_id: v.package_id || null, paid_on: v.paid_on || null, source_date_unknown: !!v.source_date_unknown, stage: PaymentStages.name(v.stage as string) }
  }

  async #money(client: ClientRow, excludeId: string | null) {
    const [packages, events, all] = await Promise.all([
      this.#db.select<PackageRow>('packages', { client_id: client.id }),
      this.#db.select<EventRow>('events', { client_id: client.id }),
      this.#db.select<PaymentRow>('payments', { client_id: client.id }),
    ])
    const payments = all.filter(p => p.id !== excludeId)
    const quote = Pricing.quote({ financeMode: client.finance_mode, amount: client.price - client.discount }, packages, events.map(e => ({ quotation: e.quotation ?? undefined })))
    return { quote, paid: payments.reduce((n, p) => n + p.amount, 0), packages, events, payments }
  }

  async #client(id: string): Promise<ClientRow> {
    const [client] = id ? await this.#db.select<ClientRow>('clients', { id }) : []
    if (!client || client.deleted_at) throw new HttpError(400, 'Select a client')
    return client
  }
}
