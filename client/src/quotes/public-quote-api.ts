import type { SharedQuote } from '@framewise/shared/quote.ts'

export class PublicQuoteApi {
  constructor(studio: string, token: string) {
    this.#path = `/api/public/quotes/${encodeURIComponent(studio)}/${encodeURIComponent(token)}`
  }

  get(): Promise<SharedQuote> { return this.#send() }
  accept(code: string, consent: boolean): Promise<SharedQuote> { return this.#send({ code, consent }) }

  #path: string

  async #send(body?: { code: string; consent: boolean }): Promise<SharedQuote> {
    const res = await fetch(this.#path + (body ? '/accept' : ''), {
      method: body ? 'POST' : 'GET', cache: 'no-store', referrerPolicy: 'no-referrer',
      headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined,
    })
    const data = await res.json().catch(() => ({ error: 'Could not load the quote. Please try again.' }))
    if (!res.ok || data.error) throw new Error(data.error || 'Could not load the quote')
    return data as SharedQuote
  }
}
