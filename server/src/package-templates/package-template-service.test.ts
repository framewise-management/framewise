import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PgliteDatabase } from '../db/pglite-database.ts'
import { ServiceCatalog } from '../service-catalog/service-catalog.ts'
import { PackageTemplateService } from './package-template-service.ts'

async function setup() {
  const db = await PgliteDatabase.create()
  const catalog = new ServiceCatalog(db)
  const candid = (await catalog.create({ name: 'Candid', price: 40000 })).id as string
  const drone = (await catalog.create({ name: 'Drone', price: 15000 })).id as string
  return { db, catalog, packages: new PackageTemplateService(db, catalog), candid, drone }
}

test('ticked: the package price is the total of its services, and follows later price changes', async () => {
  const { db, catalog, packages, candid, drone } = await setup()
  try {
    const gold = await packages.create({ name: ' Gold ', use_service_prices: true, service_ids: [candid, drone], price: 1 })
    assert.deepEqual([gold.name, gold.price, gold.use_service_prices, gold.services.map(s => [s.name, s.price])], ['Gold', 55000, true, [['Candid', 40000], ['Drone', 15000]]])

    await catalog.update(drone, { price: 20000 })
    assert.equal((await packages.list())[0].price, 60000)

    await catalog.remove(drone)
    const [after] = await packages.list()
    assert.deepEqual([after.price, after.services.map(s => s.name)], [40000, ['Candid']])
  } finally { await db.pg.close() }
})

test('unticked: services are listed and the package keeps its own price', async () => {
  const { db, catalog, packages, candid, drone } = await setup()
  try {
    const p = await packages.create({ name: 'Silver', service_ids: [drone, candid], price: 50000 })
    assert.deepEqual([p.price, p.use_service_prices, p.services.map(s => s.name)], [50000, false, ['Drone', 'Candid']])
    await catalog.update(candid, { price: 99999 })
    assert.equal((await packages.list())[0].price, 50000)

    assert.equal((await packages.update(p.id, { use_service_prices: true })).price, 114999)
    const custom = await packages.update(p.id, { use_service_prices: false, price: 45000, service_ids: [candid] })
    assert.deepEqual([custom.price, custom.services.map(s => s.name)], [45000, ['Candid']])
    assert.equal((await packages.update(p.id, { active: false })).active, false)
    await packages.remove(p.id)
    assert.deepEqual(await packages.list(), [])
  } finally { await db.pg.close() }
})

test('bad package details are rejected and nothing is saved', async () => {
  const { db, packages, candid } = await setup()
  try {
    const otherStudio = (await db.pg.query<{ id: string }>(`insert into studios (company) values ('Other') returning id`)).rows[0].id
    const foreign = (await new ServiceCatalog(db.forStudio(otherStudio)).create({ name: 'Theirs', price: 1 })).id as string
    await assert.rejects(packages.create({ name: '  ', price: 100 }), { status: 400, message: 'Enter the package name' })
    await assert.rejects(packages.create({ name: 'A', price: -1 }), { status: 400, message: 'Enter a package price of zero or more' })
    await assert.rejects(packages.create({ name: 'A' }), { status: 400, message: 'Enter a package price of zero or more' })
    await assert.rejects(packages.create({ name: 'A', use_service_prices: true }), { status: 400, message: 'Add at least one service to price the package from its services' })
    await assert.rejects(packages.create({ name: 'A', price: 1, service_ids: [foreign] }), { status: 400, message: 'Choose services from your service list' })
    await assert.rejects(packages.create({ name: 'A', price: 1, service_ids: 'x' }), { status: 400, message: 'Send service_ids as a list' })
    assert.deepEqual(await packages.list(), [])
    const p = await packages.create({ name: 'A', price: 1, service_ids: [candid] })
    await assert.rejects(packages.update(p.id, {}), { status: 400, message: 'No changes provided' })
    await assert.rejects(packages.update(crypto.randomUUID(), { name: 'X' }), { status: 404 })
  } finally { await db.pg.close() }
})
