export interface QuoteSnapshot {
  company: string
  clientName: string
  events: { id: string; type: string; date: string | null; start: string | null; end: string | null; venue: string; city: string | null; services: string[] }[]
  lines: { name: string; price: number; discount: number; total: number; deliverables: string[] }[]
  total: number
  terms: { title: string; body: string }[]
  paymentPlan: { stage: string; target: number }[]
}

export interface SharedQuote {
  id: string
  status: 'Sent' | 'Accepted' | 'Superseded'
  snapshot: QuoteSnapshot
  created_at: string
  expires_at: string
  accepted_at: string | null
}

export class Quote {
  static consentValid(value: unknown): boolean { return value === true }

  static expired(expiresAt: string, now = Date.now()): boolean {
    return new Date(expiresAt).getTime() <= now
  }
}
