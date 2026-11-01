import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ClientService } from '../clients/client-service.ts'
import { PgliteDatabase } from '../db/pglite-database.ts'
import { EventService } from '../events/event-service.ts'
import { PackageService } from '../packages/package-service.ts'
import { PaymentService } from '../payments/payment-service.ts'
import { InvoiceService } from './invoice-service.ts'

test('package receipt balance only includes payments from that package and issued payments cannot be edited', async () => {
  const db = await PgliteDatabase.create()
  const [[client]] = await db.apply([{ op: 'insert', table: 'clients', row: { name: 'Asha' } }])
  const [[firstPackage], [secondPackage]] = await db.apply([
    { op: 'insert', table: 'packages', row: { client_id: client.id, name: 'Wedding', price: 50000 } },
    { op: 'insert', table: 'packages', row: { client_id: client.id, name: 'Pre-wedding', price: 20000 } },
  ])
  const payments = new PaymentService(db)
  const firstPayment = await payments.create({ client_id: client.id, package_id: firstPackage.id, amount: 10000, paid_on: '2026-10-24' })
  await payments.create({ client_id: client.id, package_id: secondPackage.id, amount: 5000, paid_on: '2026-10-24' })
  const receipt = await new InvoiceService(db).issueReceipt(firstPayment.id as string)
  const snapshot = receipt.snapshot as { quote: number; received: number; outstanding: number }
  assert.deepEqual([snapshot.quote, snapshot.received, snapshot.outstanding], [50000, 10000, 40000])
  await assert.rejects(payments.edit(firstPayment.id as string, { amount: 12000 }), /issued receipt/i)
})

test('receipt issuance is idempotent and preserves payment, booking, and studio snapshots', async () => {
  const db = await PgliteDatabase.create()
  const events = new EventService(db, () => '2026-10-24')
  const packages = new PackageService(db)
  const client = await new ClientService(db, events, packages).create({ name: 'Asha', price: 50000 }, [{ type: 'Wedding', date: '2026-12-10', venue: 'Pune', services: ['Candid'] }])
  await db.apply([{ op: 'update', table: 'studios', match: {}, set: { company: 'Studio One', invoice_business: { gst_number: 'GST-1' } } }])
  const payment = await new PaymentService(db).create({ client_id: client.id, amount: 10000, paid_on: '2026-10-24', stage: 'Booking', method: 'UPI' })
  const invoices = new InvoiceService(db)
  const first = await invoices.issueReceipt(payment.id as string)
  await db.apply([{ op: 'update', table: 'clients', match: { id: client.id }, set: { name: 'Changed', price: 60000 } }])
  const second = await invoices.issueReceipt(payment.id as string)
  assert.equal(first.id, second.id)
  assert.equal(first.number, '000001')
  assert.equal((first.snapshot as any).client.name, 'Asha')
  assert.equal((first.snapshot as any).company.gst_number, 'GST-1')
  assert.equal((first.snapshot as any).quote, 50000)
  assert.equal((await invoices.get(first.id as string)).id, first.id)
  assert.deepEqual((await invoices.clientDocuments(client.id as string)).map(row => row.id), [first.id])
  await assert.rejects(invoices.issueReceipt(crypto.randomUUID()), /Payment not found/)
})
