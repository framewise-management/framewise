import { test } from 'node:test'
import assert from 'node:assert/strict'
import { AmountWords } from './amount-words.ts'

const { amountWords } = await import(new URL('../../legacy/dist/invoices.js', import.meta.url).href)

test('amounts in words match legacy amountWords', () => {
  for (const n of [0, 7, 19, 20, 99, 100, 101, 999, 1000, 14800, 99999, 100000, 250000, 1234567, 10000000, 123456789, 1500.5, 1500.05, 0.99, 2999.999])
    assert.equal(AmountWords.inr(n), amountWords(n), String(n))
  assert.equal(AmountWords.inr(150000), 'Indian Rupees One Lakh Fifty Thousand Only')
})
