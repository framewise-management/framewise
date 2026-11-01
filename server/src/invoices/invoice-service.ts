import { Pricing } from '@framewise/shared/pricing.ts'
import type { Database, Row } from '../db/database.ts'
import type { ClientRow, EventRow, PackageRow, PaymentRow } from '../db/rows.ts'
import { HttpError } from '../http/http-error.ts'

export class InvoiceService {
  readonly #db: Database

  constructor(db: Database) { this.#db = db }

  async clientDocuments(clientId: string): Promise<Row[]> {
    return (await this.#db.select<Row>('invoices', { client_id: clientId })).filter(row => row.client_invoice || row.document_kind === 'receipt')
  }

  async get(id: string): Promise<Row> {
    const [invoice] = await this.#db.select<Row>('invoices', { id })
    if (!invoice) throw new HttpError(404, 'Invoice not found')
    return invoice
  }

  async issueReceipt(paymentId: string): Promise<Row> {
    const existing = await this.#receipt(paymentId)
    if (existing) return existing
    const [payment] = await this.#db.select<PaymentRow>('payments', { id: paymentId })
    if (!payment) throw new HttpError(404, 'Payment not found')
    const [client] = await this.#db.select<ClientRow>('clients', { id: payment.client_id })
    if (!client || client.deleted_at) throw new HttpError(404, 'Client not found')
    const [settings] = await this.#db.select<Row>('studios')
    const [event] = payment.event_id ? await this.#db.select<EventRow>('events', { id: payment.event_id }) : []
    const [pkg] = payment.package_id ? await this.#db.select<PackageRow>('packages', { id: payment.package_id }) : []
    const [events, packages, payments] = await Promise.all([
      this.#db.select<EventRow>('events', { client_id: client.id }),
      this.#db.select<PackageRow>('packages', { client_id: client.id }),
      this.#db.select<PaymentRow>('payments', { client_id: client.id }),
    ])
    const { quote, received } = Pricing.balance(
      { financeMode: client.finance_mode, amount: client.price - client.discount }, packages, events,
      payments.map(p => ({ amount: p.amount, packageId: p.package_id, eventId: p.event_id })),
      { packageId: payment.package_id, eventId: payment.event_id },
    )
    const business = { company: settings.company, currency: settings.currency, ...((settings.invoice_business as Row | undefined) ?? {}) }
    const snapshot = {
      documentKind: 'receipt', clientId: client.id, billTo: client.name, client: { ...client }, company: business,
      date: payment.paid_on, issuedAt: new Date().toISOString(), bookingName: pkg?.name ?? event?.type ?? 'Photography booking',
      package: pkg ? { ...pkg } : null, event: event ? { ...event } : null, events: events.map(e => ({ ...e })),
      payment: { ...payment }, quote, received, outstanding: quote - received,
      notes: 'Payment acknowledged. This document does not create a new charge.',
    }
    try {
      const [[invoice]] = await this.#db.apply([{ op: 'insert', table: 'invoices', row: { client_id: client.id, package_id: payment.package_id, payment_id: payment.id, document_kind: 'receipt', client_invoice: false, snapshot } }])
      return invoice
    } catch (error) {
      const raced = await this.#receipt(paymentId)
      if (raced) return raced
      throw error
    }
  }

  async #receipt(paymentId: string): Promise<Row | undefined> {
    return (await this.#db.select<Row>('invoices', { payment_id: paymentId, document_kind: 'receipt' }))[0]
  }
}
