import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PgliteDatabase } from '../db/pglite-database.ts'
import { EnquiryService } from './enquiry-service.ts'

test('a confirmed enquiry converts into one client with its details', async () => {
  const db = await PgliteDatabase.create()
  const enquiries = new EnquiryService(db)
  const q = await enquiries.create({ name: 'Meera', city: 'Nashik', followup: '2026-11-01', price: 90000, discount: 10000, status: 'Contacted', package_name: 'Gold' })
  await assert.rejects(enquiries.convert(q.id as string), /Confirm the enquiry first/)
  await enquiries.update(q.id as string, { status: 'Confirmed' })
  const client = await enquiries.convert(q.id as string)
  assert.deepEqual([client.name, client.address, client.due, client.price, client.discount, client.status, client.package_name], ['Meera', 'Nashik', '2026-11-01', 90000, 10000, 'Confirmed', 'Gold'])
  assert.equal((await enquiries.convert(q.id as string)).id, client.id)
  assert.equal((await db.select('clients')).length, 1)
  assert.equal((await enquiries.list())[0].client_id, client.id)
})

test('enquiries need a name and a valid discount', async () => {
  const enquiries = new EnquiryService(await PgliteDatabase.create())
  await assert.rejects(enquiries.create({ name: '  ' }), /enquiry name/)
  await assert.rejects(enquiries.create({ name: 'A', price: 100, discount: 101 }), /Discount must be between/)
  const q = await enquiries.create({ name: 'A', price: 100 })
  await assert.rejects(enquiries.update(q.id as string, { discount: 101 }), /Discount must be between/)
  await enquiries.remove(q.id as string)
  assert.deepEqual(await enquiries.list(), [])
})
