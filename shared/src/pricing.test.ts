import { test } from 'node:test'
import assert from 'node:assert/strict'
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

function legacyQuote(client: QuotedClient, packages: PricedPackage[], events: QuotedEvent[]): number {
  const values = new Map<string, string>()
  const store = new Store({ getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => values.set(k, v) })
  store.data.clients = [{ id: 'c1', ...client }]
  store.data.packages = packages.map((p, i) => ({ id: 'p' + i, client: 'c1', events: [], ...p }))
  store.data.events = events.map((e, i) => ({ id: 'e' + i, client: 'c1', ...e }))
  return store.quote('c1')
}
