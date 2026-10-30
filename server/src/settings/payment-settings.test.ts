import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PgliteDatabase } from '../db/pglite-database.ts'
import { PaymentSettings } from './payment-settings.ts'

test('payment settings validate instalments and preserve the invoice counter and other business details', async () => {
  const db = await PgliteDatabase.create()
  await db.apply([{ op: 'update', table: 'settings', match: { id: true }, set: { invoice_business: { company_name: 'Studio' }, next_invoice: 7 } }])
  const settings = new PaymentSettings(db)
  const input = { payment_conditions: [{ label: 'Booking', percent: 50 }, { label: 'Delivery', percent: 50 }], payment_modes: ['UPI', 'Cash'], upi_id: 'studio@upi', bank_details: '', gst_number: '', payment_notes: '', invoice_prefix: 'INV-', invoice_padding: 4 }
  await assert.rejects(settings.update({ ...input, payment_conditions: [{ label: 'Booking', percent: 50 }] }), /100%/)
  await assert.rejects(settings.update({ ...input, invoice_prefix: 'INVALID PREFIX' }), /prefix/)
  const saved = await settings.update(input)
  assert.equal(saved.next_invoice, 7)
  assert.deepEqual(saved.payment_modes, ['UPI', 'Cash'])
  assert.equal((await db.select<{ invoice_business: { company_name: string } }>('settings'))[0].invoice_business.company_name, 'Studio')
})
