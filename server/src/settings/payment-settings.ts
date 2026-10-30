import type { Database, Row } from '../db/database.ts'
import { HttpError } from '../http/http-error.ts'

interface SettingsRow { invoice_business: Record<string, unknown>; invoice_prefix: string; invoice_padding: number; next_invoice: number }

export class PaymentSettings {
  readonly #db: Database
  constructor(db: Database) { this.#db = db }

  async get(): Promise<Row> {
    const [settings] = await this.#db.select<SettingsRow>('settings')
    const business = settings.invoice_business ?? {}
    return { payment_conditions: business.payment_conditions ?? [], payment_modes: business.payment_modes ?? [], upi_id: business.upi_id ?? '', bank_details: business.bank_details ?? '', gst_number: business.gst_number ?? '', payment_notes: business.payment_notes ?? '', invoice_prefix: settings.invoice_prefix, invoice_padding: settings.invoice_padding, next_invoice: settings.next_invoice }
  }

  async update(input: Row): Promise<Row> {
    const [settings] = await this.#db.select<SettingsRow>('settings')
    const conditions = input.payment_conditions
    const modes = input.payment_modes
    const allowed = ['UPI', 'Bank transfer', 'Cash', 'Cheque', 'Card']
    if (!Array.isArray(conditions) || conditions.some(c => !c || typeof c.label !== 'string' || !c.label.trim() || typeof c.percent !== 'number' || !Number.isFinite(c.percent) || c.percent < 0 || c.percent > 100) || (conditions.length > 0 && Math.abs(conditions.reduce((n, c) => n + c.percent, 0) - 100) > 0.0001)) throw new HttpError(400, 'Enter instalment names and percentages totalling 100%')
    if (!Array.isArray(modes) || modes.some(m => typeof m !== 'string' || !allowed.includes(m)) || new Set(modes).size !== modes.length) throw new HttpError(400, 'Select valid payment methods')
    const prefix = input.invoice_prefix
    const padding = input.invoice_padding
    if (typeof prefix !== 'string' || !/^[A-Za-z0-9_-]{0,16}$/.test(prefix)) throw new HttpError(400, 'Invoice prefix can contain up to 16 letters, numbers, hyphens or underscores')
    if (!Number.isInteger(padding) || Number(padding) < 3 || Number(padding) > 10) throw new HttpError(400, 'Invoice number length must be between 3 and 10')
    const fields = ['upi_id', 'bank_details', 'gst_number', 'payment_notes'] as const
    if (fields.some(k => typeof input[k] !== 'string')) throw new HttpError(400, 'Enter valid payment details')
    const invoiceBusiness = { ...settings.invoice_business, payment_conditions: conditions.map(c => ({ label: c.label.trim(), percent: c.percent })), payment_modes: modes, ...Object.fromEntries(fields.map(k => [k, (input[k] as string).trim()])) }
    await this.#db.apply([{ op: 'update', table: 'settings', match: { id: true }, set: { invoice_business: invoiceBusiness, invoice_prefix: prefix, invoice_padding: padding } }])
    return this.get()
  }
}
