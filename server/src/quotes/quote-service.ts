import { randomBytes } from 'node:crypto'
import { Pricing } from '@framewise/shared/pricing.ts'
import { ProductionStages } from '@framewise/shared/production-stages.ts'
import { Quote, type QuoteSnapshot, type SharedQuote } from '@framewise/shared/quote.ts'
import type { Change, Database, Row } from '../db/database.ts'
import { HttpError } from '../http/http-error.ts'

export interface QuoteRecord extends SharedQuote {
  client_id: string
  studio_id: string
  token: string
  source: Source
}

export class QuoteService {
  constructor(db: Database) { this.#db = db }

  async list(clientId: string): Promise<QuoteRecord[]> {
    return (await this.#db.select<QuoteRecord>('quotes', { client_id: clientId })).sort((a, b) => b.created_at.localeCompare(a.created_at))
  }

  async create(clientId: string): Promise<QuoteRecord> {
    const source = await this.#source(clientId)
    const c = source.client
    if (['Canceled', 'Lost', 'Completed'].includes(String(c.status))) throw new HttpError(400, 'Reopen the client before sending a quote')
    if (!source.events.length || source.events.some(e => !e.event_date || !e.venue || !(e.services as string[]).length))
      throw new HttpError(400, 'Add event dates, locations and services before sending a quote')
    const [studio] = await this.#db.select('studios')
    const terms = (await this.#db.select('terms')).filter(t => t.active).sort(byId)
    if (!terms.length) throw new HttpError(400, 'Add active terms and conditions in Settings first')
    const snapshot = this.#snapshot(source, String(studio.company), terms)
    const changes: Change[] = (await this.list(clientId)).filter(q => q.status === 'Sent').map(q => ({ op: 'update', table: 'quotes', match: { id: q.id, status: 'Sent' }, set: { status: 'Superseded' } }))
    changes.push({ op: 'insert', table: 'quotes', row: {
      client_id: clientId, token: randomBytes(32).toString('hex'), snapshot, source,
      expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
    } })
    const results = await this.#db.apply(changes)
    return results.at(-1)![0] as unknown as QuoteRecord
  }

  async view(token: string): Promise<SharedQuote> {
    return publicQuote(await this.#find(token))
  }

  async accept(token: string, code: unknown, consent: unknown): Promise<SharedQuote> {
    if (!Quote.consentValid(consent)) throw new HttpError(400, 'Agree to the quote and terms first')
    // Deliberately fixed in production for the requested testing flow; this does not verify an email or phone.
    if (code !== '111111') throw new HttpError(400, 'Incorrect confirmation code')
    const quote = await this.#find(token)
    if (quote.status === 'Accepted') return publicQuote(quote)
    if (quote.status !== 'Sent' || Quote.expired(quote.expires_at)) throw new HttpError(409, 'This quote is no longer available. Ask the studio for a new link.')
    const projects = await this.#db.select('projects')
    const changes: Change[] = [
      { op: 'update', table: 'quotes', match: { id: quote.id, status: 'Sent' }, set: { status: 'Accepted', accepted_at: new Date().toISOString(), acceptance_method: 'fixed_code', consent: true } },
      { op: 'update', table: 'clients', match: { id: quote.client_id }, set: { status: 'Booked' } },
    ]
    for (const event of quote.snapshot.events) {
      changes.push({ op: 'update', table: 'events', match: { id: event.id, client_id: quote.client_id }, set: { booking_status: 'Booked', booking_override: true } })
      if (!projects.some(p => p.event_id === event.id)) changes.push({ op: 'insert', table: 'projects', row: {
        event_id: event.id, stage: 0, stage_names: ProductionStages.forBooking(), completed_stages: [],
      } })
    }
    for (const enquiry of await this.#db.select('enquiries', { client_id: quote.client_id }))
      changes.push({ op: 'update', table: 'enquiries', match: { id: enquiry.id }, set: { status: 'Booked' } })
    try { await this.#db.apply(changes) }
    catch (error) {
      const current = await this.#find(token)
      if (current.status === 'Accepted') return publicQuote(current)
      throw error
    }
    return publicQuote(await this.#find(token))
  }

  #db: Database

  async #find(token: string): Promise<QuoteRecord> {
    if (!/^[a-f0-9]{64}$/.test(token)) throw new HttpError(404, 'Quote not found')
    const [quote] = await this.#db.select<QuoteRecord>('quotes', { token })
    if (!quote) throw new HttpError(404, 'Quote not found')
    const [client] = await this.#db.select('clients', { id: quote.client_id })
    if (!client || client.deleted_at) throw new HttpError(404, 'Quote not found')
    return quote
  }

  async #source(clientId: string): Promise<Source> {
    const [client] = await this.#db.select('clients', { id: clientId })
    if (!client || client.deleted_at) throw new HttpError(404, 'Client not found')
    const [events, packages, allItems, plans] = await Promise.all([
      this.#db.select('events', { client_id: clientId }), this.#db.select('packages', { client_id: clientId }),
      this.#db.select('delivery_items'), this.#db.select('payment_stage_plans', { client_id: clientId }),
    ])
    return { client, events: events.sort(byId), packages: packages.sort(byId), items: allItems.filter(i => packages.some(p => p.id === i.package_id)).sort(byId), plans: plans.sort((a, b) => String(a.stage) < String(b.stage) ? -1 : String(a.stage) > String(b.stage) ? 1 : 0) }
  }

  #snapshot(source: Source, company: string, terms: Row[]): QuoteSnapshot {
    const { client: c, events, packages, items, plans } = source
    const lines = packages.length ? packages.map(p => ({ name: String(p.name), price: Number(p.price), discount: Number(p.discount), total: Pricing.finalQuote(Number(p.price), Number(p.discount)), deliverables: items.filter(i => i.package_id === p.id && !i.retired_at).map(i => `${i.label}${i.quantity ? ` × ${i.quantity}` : ''}${i.duration ? ` · ${i.duration}` : ''}`) }))
      : c.finance_mode === 'Per day' ? events.map(e => ({ name: String(e.type), price: Number(e.price), discount: Number(e.discount), total: Number(e.quotation || 0), deliverables: [] }))
      : [{ name: String(c.package_name || 'Photography booking'), price: Number(c.price), discount: Number(c.discount), total: Pricing.finalQuote(Number(c.price), Number(c.discount)), deliverables: [] }]
    return {
      company, clientName: String(c.name), lines, total: Pricing.quote({ financeMode: c.finance_mode as 'Shared' | 'Per day', amount: Pricing.finalQuote(Number(c.price), Number(c.discount)) }, packages as unknown as { price: number; discount: number }[], events),
      events: events.map(e => ({ id: String(e.id), type: String(e.type), date: e.event_date as string | null, start: e.start_time as string | null, end: e.end_time as string | null, venue: String(e.venue), city: e.city as string | null, services: e.services as string[] })),
      terms: terms.map(t => ({ title: String(t.title), body: String(t.body) })), paymentPlan: plans.map(p => ({ stage: String(p.stage), target: Number(p.target) })),
    }
  }
}

interface Source { client: Row; events: Row[]; packages: Row[]; items: Row[]; plans: Row[] }

function byId(a: Row, b: Row): number { return String(a.id).localeCompare(String(b.id)) }
function publicQuote(q: QuoteRecord): SharedQuote {
  return { id: q.id, status: q.status, snapshot: q.snapshot, created_at: q.created_at, expires_at: q.expires_at, accepted_at: q.accepted_at }
}
