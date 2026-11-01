import { PricingError } from './pricing-error.ts'

export type FinanceMode = 'Shared' | 'Per day'

export interface PricedPackage {
  price: number
  discount?: number
}

export interface QuotedClient {
  financeMode?: FinanceMode
  amount?: number
}

export interface QuotedEvent {
  quotation?: number | null
}

export interface LedgerPayment {
  amount: number
  packageId?: string | null
  eventId?: string | null
}

export interface Balance {
  scope: 'package' | 'event' | 'client'
  quote: number
  received: number
}

export class Pricing {
  static finalQuote(price: number, discount = 0): number {
    if (!Number.isFinite(price) || !Number.isFinite(discount) || price < 0 || discount < 0 || discount > price)
      throw new PricingError('Discount must be between zero and package price')
    return price - discount
  }

  // a setup package priced from its services; rounded to paise so float sums like 0.1 + 0.2 stay exact
  static servicesTotal(prices: readonly number[]): number {
    return Math.round(prices.reduce((n, p) => n + p, 0) * 100) / 100
  }

  // the one place that chooses between the three pricing models: packages win, then per-day quotes, then the client's amount
  static quote(client: QuotedClient, packages: readonly PricedPackage[], events: readonly QuotedEvent[]): number {
    if (packages.length) return packages.reduce((n, p) => n + Pricing.finalQuote(p.price, p.discount), 0)
    if (client.financeMode === 'Per day') return events.reduce((n, e) => n + (e.quotation || 0), 0)
    return client.amount || 0
  }

  // what a payment counts against, by the same models: its package, else its event when days are priced separately, else the client
  static balance(
    client: QuotedClient,
    packages: readonly (PricedPackage & { id: string })[],
    events: readonly (QuotedEvent & { id: string })[],
    payments: readonly LedgerPayment[],
    target: { packageId?: string | null; eventId?: string | null } = {},
  ): Balance {
    const pkg = packages.find(p => p.id === target.packageId)
    if (pkg) return { scope: 'package', quote: Pricing.finalQuote(pkg.price, pkg.discount), received: sum(payments.filter(p => p.packageId === pkg.id)) }
    const event = !packages.length && client.financeMode === 'Per day' ? events.find(e => e.id === target.eventId) : undefined
    if (event) return { scope: 'event', quote: event.quotation || 0, received: sum(payments.filter(p => p.eventId === event.id)) }
    return { scope: 'client', quote: Pricing.quote(client, packages, events), received: sum(payments) }
  }
}

function sum(payments: readonly LedgerPayment[]): number {
  return payments.reduce((n, p) => n + p.amount, 0)
}
