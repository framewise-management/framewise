import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PaymentStages } from './payment-stages.ts'

const legacy = await import(new URL('../../legacy/dist/payment-ledger.js', import.meta.url).href)

test('core stages and stage names match legacy', () => {
  assert.deepEqual(PaymentStages.core, legacy.corePaymentStages)
  for (const value of ['booking', 'Booking Amount', 'On-event', 'on event', 'After Event', 'album printing', ' Delivery ', 'Before Event', 'Final Payment', 'Custom', '', null, undefined])
    assert.equal(PaymentStages.name(value), legacy.stageName(value), String(value))
})

test('stage summary matches legacy stageSummary', () => {
  const payments = [
    { id: 'p1', client: 'c1', stage: 'Booking', amount: 5000 },
    { id: 'p2', client: 'c1', stage: 'On Event', amount: 3000 },
    { id: 'p3', client: 'c1', stage: 'Custom', amount: 100 },
    { id: 'p4', client: 'c1', amount: 50 },
  ]
  const plansCases: Record<string, number>[] = [{}, { 'Booking Amount': 5000, 'On Event': 10000, 'Delivery': 0, 'After Event': 0, 'Extra': 2000 }]
  for (const plans of plansCases) {
    const data = { payments, settings: { paymentStagePlans: { c1: plans } } }
    assert.deepEqual(PaymentStages.summary(payments, plans), legacy.stageSummary(data, 'c1'), JSON.stringify(plans))
  }
  assert.deepEqual(PaymentStages.summary([]), legacy.stageSummary({ payments: [], settings: {} }, 'c1'))
})
