import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PgliteDatabase } from '../db/pglite-database.ts'
import { ServiceCatalog } from './service-catalog.ts'

test('services are created, listed by name, edited, deactivated and deleted', async () => {
  const db = await PgliteDatabase.create()
  try {
    const services = new ServiceCatalog(db)
    const drone = await services.create({ name: ' Drone ', tag: ' Videography ', price: 15000 })
    await services.create({ name: 'Candid', price: 0 })
    assert.deepEqual((await services.list()).map(s => [s.name, s.tag, s.price, s.active]), [
      ['Candid', null, 0, true],
      ['Drone', 'Videography', 15000, true],
    ])

    await services.update(drone.id as string, { price: 18000, tag: '', active: false })
    const [, updated] = await services.list()
    assert.deepEqual([updated.price, updated.tag, updated.active], [18000, null, false])

    await services.remove(drone.id as string)
    assert.deepEqual((await services.list()).map(s => s.name), ['Candid'])
    await assert.rejects(services.update(drone.id as string, { name: 'X' }), /Record not found/)
  } finally { await db.pg.close() }
})

test('bad service details are rejected with a message', async () => {
  const db = await PgliteDatabase.create()
  try {
    const services = new ServiceCatalog(db)
    await assert.rejects(services.create({ name: ' ', price: 1 }), { status: 400, message: 'Enter the service name' })
    await assert.rejects(services.create({ name: 'A', price: -5 }), { status: 400, message: 'Enter a service price of zero or more' })
    await assert.rejects(services.create({ name: 'A', price: '5' }), { status: 400 })
    await assert.rejects(services.create({ name: 'A', price: 5, tag: 7 }), { status: 400, message: 'Invalid service tag' })
    const s = await services.create({ name: 'A', price: 5 })
    await assert.rejects(services.update(s.id as string, { active: 'yes' }), { status: 400, message: 'Invalid service visibility' })
    await assert.rejects(services.update(s.id as string, {}), { status: 400, message: 'No changes provided' })
    assert.equal((await services.list()).length, 1)
  } finally { await db.pg.close() }
})
