import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PricingError } from './pricing-error.ts'
import { Pricing, type PricedPackage, type QuotedClient, type QuotedEvent } from './pricing.ts'

const { finalQuote } = await import(new URL('../../legacy/dist/business.js', import.meta.url).href)
const { Store } = await import(new URL('../../legacy/dist/store.js', import.meta.url).href)

test('finalQuote matches legacy, including the errors', () => {
  for (const [price, discount] of [[100000, 0], [100000, 15000], [5000, 5000], [0, 0], [100, 101], [100, -1], [-5, 0], [NaN, 0]]) {
    let expected: unknown
    try { expected = finalQuote(price, discount) } catch (e) { expected = (e as Error).message }
    let actual: unknown
    try { actual = Pricing.finalQuote(price, discount) } catch (e) { actual = (e as Error).message }
    assert.equal(actual, expected, `${price} - ${discount}`)
  }
  assert.equal(Pricing.finalQuote(5000), 5000)
})

test('quote picks the same pricing model as the legacy Store', () => {
  const cases: [QuotedClient, PricedPackage[], QuotedEvent[]][] = [
    [{ amount: 150000 }, [], [{ quotation: 40000 }]],
    [{ financeMode: 'Shared', amount: 150000 }, [], []],
    [{ financeMode: 'Per day', amount: 150000 }, [], [{ quotation: 40000 }, { quotation: 60000 }, {}]],
    [{ financeMode: 'Per day', amount: 150000 }, [{ price: 90000, discount: 10000 }, { price: 50000 }], [{ quotation: 40000 }]],
    [{}, [], []],
  ]
  for (const [client, packages, events] of cases)
    assert.equal(Pricing.quote(client, packages, events), legacyQuote(client, packages, events), JSON.stringify(client))
})

test('finalQuote rejects with a PricingError', () => {
  assert.throws(() => Pricing.finalQuote(100, 101), PricingError)
})

test('balance holds a payment against its package, its per-day event, or the whole client', () => {
  const payments = [{ amount: 10000, packageId: 'p1' }, { amount: 5000, eventId: 'e1' }, { amount: 2000 }]
  const packages = [{ id: 'p1', price: 90000, discount: 10000 }, { id: 'p2', price: 50000 }]
  const events = [{ id: 'e1', quotation: 40000 }, { id: 'e2', quotation: null }]
  const perDay: QuotedClient = { financeMode: 'Per day', amount: 150000 }

  assert.deepEqual(Pricing.balance(perDay, packages, events, payments, { packageId: 'p1', eventId: 'e1' }), { scope: 'package', quote: 80000, received: 10000 })
  assert.deepEqual(Pricing.balance(perDay, [], events, payments, { eventId: 'e1' }), { scope: 'event', quote: 40000, received: 5000 })
  assert.deepEqual(Pricing.balance(perDay, [], events, payments, { eventId: 'e2' }), { scope: 'event', quote: 0, received: 0 })
  assert.deepEqual(Pricing.balance({ financeMode: 'Shared', amount: 150000 }, [], events, payments, { eventId: 'e1' }), { scope: 'client', quote: 150000, received: 17000 })
  assert.deepEqual(Pricing.balance(perDay, packages, events, payments, { eventId: 'e1' }), { scope: 'client', quote: 130000, received: 17000 })
  assert.deepEqual(Pricing.balance(perDay, [], events, payments), { scope: 'client', quote: 40000, received: 17000 })
})

function legacyQuote(client: QuotedClient, packages: PricedPackage[], events: QuotedEvent[]): number {
  const values = new Map<string, string>()
  const store = new Store({ getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => values.set(k, v) })
  store.data.clients = [{ id: 'c1', ...client }]
  store.data.packages = packages.map((p, i) => ({ id: 'p' + i, client: 'c1', events: [], ...p }))
  store.data.events = events.map((e, i) => ({ id: 'e' + i, client: 'c1', ...e }))
  return store.quote('c1')
}
