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
  quotation?: number
}

export class Pricing {
  static finalQuote(price: number, discount = 0): number {
    if (!Number.isFinite(price) || !Number.isFinite(discount) || price < 0 || discount < 0 || discount > price)
      throw new Error('Discount must be between zero and package price')
    return price - discount
  }

  // the one place that chooses between the three pricing models: packages win, then per-day quotes, then the client's amount
  static quote(client: QuotedClient, packages: readonly PricedPackage[], events: readonly QuotedEvent[]): number {
    if (packages.length) return packages.reduce((n, p) => n + Pricing.finalQuote(p.price, p.discount), 0)
    if (client.financeMode === 'Per day') return events.reduce((n, e) => n + (e.quotation || 0), 0)
    return client.amount || 0
  }
}
