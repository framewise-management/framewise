import { Booking, type CalendarState } from '@framewise/shared/booking.ts'
import { PaymentStages, type StageSummary } from '@framewise/shared/payment-stages.ts'
import { Pricing } from '@framewise/shared/pricing.ts'
import type { ApiClient } from '../api/api-client.ts'
import type { Client, Lists, Package, Payment, StudioEvent } from './types.ts'

// everything the pages show, loaded once and re-loaded after each change; money comes from the same shared rules the server uses
export class StudioData {
  readonly clients: Client[]
  readonly events: StudioEvent[]
  readonly packages: Package[]
  readonly payments: Payment[]
  readonly enquiries: Lists['enquiries']
  readonly stagePlans: Lists['stagePlans']
  readonly team: Lists['team']

  private constructor(lists: Lists) {
    this.clients = lists.clients
    this.events = [...lists.events].sort(StudioData.byDate)
    this.packages = lists.packages
    this.payments = lists.payments
    this.enquiries = lists.enquiries
    this.stagePlans = lists.stagePlans
    this.team = lists.team
  }

  static of(lists: Lists): StudioData {
    return new StudioData(lists)
  }

  static async load(api: ApiClient): Promise<StudioData> {
    const [clients, events, packages, payments, enquiries, stagePlans, team] = await Promise.all([
      api.get<Lists['clients']>('/clients'), api.get<Lists['events']>('/events'), api.get<Lists['packages']>('/packages'),
      api.get<Lists['payments']>('/payments'), api.get<Lists['enquiries']>('/enquiries'), api.get<Lists['stagePlans']>('/stage-plans'),
      api.get<Lists['team']>('/team'),
    ])
    return new StudioData({ clients, events, packages, payments, enquiries, stagePlans, team })
  }

  static byDate(a: StudioEvent, b: StudioEvent): number {
    return ((a.event_date || '') + (a.start_time || '')).localeCompare((b.event_date || '') + (b.start_time || ''))
  }

  client(id: string | null | undefined): Client | undefined {
    return this.clients.find(c => c.id === id)
  }

  event(id: string | null | undefined): StudioEvent | undefined {
    return this.events.find(e => e.id === id)
  }

  eventsOf(clientId: string): StudioEvent[] {
    return this.events.filter(e => e.client_id === clientId)
  }

  packagesOf(clientId: string): Package[] {
    return this.packages.filter(p => p.client_id === clientId)
  }

  paymentsOf(clientId: string): Payment[] {
    return this.payments.filter(p => p.client_id === clientId)
  }

  quote(clientId: string): number {
    const c = this.client(clientId)
    if (!c) return 0
    return Pricing.quote({ financeMode: c.finance_mode, amount: c.price - c.discount }, this.packagesOf(clientId), this.eventsOf(clientId).map(e => ({ quotation: e.quotation ?? undefined })))
  }

  paid(clientId: string): number {
    return this.paymentsOf(clientId).reduce((n, p) => n + p.amount, 0)
  }

  balance(clientId: string): number {
    return this.quote(clientId) - this.paid(clientId)
  }

  packagePaid(packageId: string): number {
    return this.payments.filter(p => p.package_id === packageId).reduce((n, p) => n + p.amount, 0)
  }

  packageBalance(p: Package): number {
    return p.price - p.discount - this.packagePaid(p.id)
  }

  eventPaid(eventId: string): number {
    return this.payments.filter(p => p.event_id === eventId).reduce((n, p) => n + p.amount, 0)
  }

  booking(e: StudioEvent): CalendarState {
    return Booking.state({ bookingStatus: e.booking_status ?? undefined }, { status: this.client(e.client_id)?.status })
  }

  isActive(e: StudioEvent): boolean {
    const state = this.booking(e)
    return state !== 'Canceled' && state !== 'Lost'
  }

  bookedEvents(clientId: string): StudioEvent[] {
    return this.eventsOf(clientId).filter(e => this.booking(e) === 'Confirmed')
  }

  nextEvent(clientId: string, today: string): StudioEvent | undefined {
    return this.eventsOf(clientId).find(e => e.status !== 'Shoot Completed' && (!e.event_date || e.event_date >= today) && this.isActive(e))
  }

  stages(clientId: string): StageSummary<Payment>[] {
    const plan = Object.fromEntries(this.stagePlans.filter(p => p.client_id === clientId).map(p => [p.stage, p.target]))
    return PaymentStages.summary(this.paymentsOf(clientId), plan)
  }

  memberName(id: string): string {
    return this.team.find(t => t.id === id)?.name || 'Unassigned'
  }
}
