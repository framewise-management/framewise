import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PgliteDatabase } from '../db/pglite-database.ts'
import { EnquiryService } from './enquiry-service.ts'

test('a legacy booked enquiry converts into one client with its details', async () => {
  const db = await PgliteDatabase.create()
  const enquiries = new EnquiryService(db)
  const [[q]] = await db.apply([{ op: 'insert', table: 'enquiries', row: { name: 'Meera', city: 'Nashik', followup: '2026-11-01', price: 90000, discount: 10000, status: 'Open', package_name: 'Gold' } }])
  await assert.rejects(enquiries.convert(q.id as string), /Mark the enquiry Booked first/)
  await enquiries.update(q.id as string, { status: 'Canceled' })
  await assert.rejects(enquiries.convert(q.id as string), /Mark the enquiry Booked first/)
  await enquiries.update(q.id as string, { status: 'Booked' })
  const client = await enquiries.convert(q.id as string)
  assert.deepEqual([client.name, client.address, client.due, client.price, client.discount, client.status, client.package_name], ['Meera', 'Nashik', '2026-11-01', 90000, 10000, 'Confirmed', 'Gold'])
  assert.equal((await enquiries.convert(q.id as string)).id, client.id)
  assert.equal((await db.select('clients')).length, 1)
  assert.equal((await enquiries.list())[0].client_id, client.id)
})

test('new enquiries immediately create a tentative client without requiring conversion', async () => {
  const db = await PgliteDatabase.create()
  try {
    const enquiries = new EnquiryService(db)
    const q = await enquiries.create({ name: 'Mira', phone: '1234567890', city: 'Pune', price: 1000 })
    assert.equal(q.status, 'Open')
    const client = await enquiries.convert(String(q.id))
    assert.equal(client.id, q.client_id)
    assert.equal(client.status, 'Tentative')
    assert.equal(client.address, 'Pune')
    assert.equal(client.phone, '1234567890')
    assert.equal((await db.select('clients')).length, 1)
    await assert.rejects(enquiries.create({ name: 'Fail', status: 'Invalid' }))
    assert.equal((await db.select('clients')).length, 1)
  } finally { await db.pg.close() }
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
