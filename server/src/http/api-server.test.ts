import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { AddressInfo } from 'node:net'
import { PgliteDatabase } from '../db/pglite-database.ts'
import { Studio } from '../studio.ts'
import { ApiServer } from './api-server.ts'

// tokens: 'good' signs in to the first studio, 'other' to a second studio, 'loose' is a login without a studio
async function start() {
  const db = await PgliteDatabase.create()
  const other = (await db.pg.query<{ id: string }>(`insert into studios (company) values ('Other') returning id`)).rows[0].id
  const studios: Record<string, string | null> = { good: db.studioId, other, loose: null }
  const signups: unknown[] = []
  const api = new ApiServer({
    auth: { verify: async token => (token in studios ? { userId: 'user-' + token, studioId: studios[token] } : null) },
    onboarding: { createForUser: async (userId, details) => { signups.push([userId, details]); return { id: 'new-studio', company: details.company } } },
    servicesFor: studioId => Studio.services(db.forStudio(studioId), () => '2026-10-24'),
  })
  const server = await api.listen(0)
  const base = `http://localhost:${(server.address() as AddressInfo).port}`
  const call = async (method: string, path: string, body?: unknown, token = 'good') => {
    const res = await fetch(base + path, { method, headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: body === undefined ? undefined : JSON.stringify(body) })
    const json: any = res.status === 204 ? null : await res.json()
    return { status: res.status, body: json }
  }
  return { server, call, signups }
}

test('setup packages round-trip over http and stay inside their studio', async () => {
  const { server, call } = await start()
  try {
    const candid = (await call('POST', '/api/services', { name: 'Candid', price: 40000 })).body
    const drone = (await call('POST', '/api/services', { name: 'Drone', price: 15000 })).body
    const created = await call('POST', '/api/package-templates', { name: 'Gold', use_service_prices: true, service_ids: [candid.id, drone.id], price: 1 })
    assert.deepEqual([created.status, created.body.name, created.body.price, created.body.services.length], [201, 'Gold', 55000, 2])
    assert.equal((await call('PATCH', `/api/package-templates/${created.body.id}`, { use_service_prices: false, price: 50000 })).body.price, 50000)
    assert.deepEqual(await call('POST', '/api/package-templates', { name: 'X', price: 1, description: 'x' }), { status: 400, body: { error: 'Unknown fields: description' } })
    assert.deepEqual(await call('POST', '/api/package-templates', { name: 'X', price: 1, studio_id: 'x' }), { status: 400, body: { error: 'Unknown fields: studio_id' } })
    assert.equal((await call('PATCH', `/api/package-templates/${created.body.id}`, { active: false })).body.active, false)
    assert.deepEqual((await call('GET', '/api/package-templates', undefined, 'other')).body, [])
    assert.equal((await call('PATCH', `/api/package-templates/${created.body.id}`, { name: 'Mine' }, 'other')).status, 404)
    assert.equal((await call('DELETE', `/api/package-templates/${created.body.id}`, undefined, 'other')).status, 404)
    assert.equal((await call('DELETE', `/api/package-templates/${created.body.id}`)).status, 204)
    assert.deepEqual((await call('GET', '/api/package-templates')).body, [])
  } finally {
    server.close()
  }
})

test('setup services round-trip over http and stay inside their studio', async () => {
  const { server, call } = await start()
  try {
    const created = await call('POST', '/api/services', { name: 'Drone', tag: 'Videography', price: 15000 })
    assert.deepEqual([created.status, created.body.name, created.body.tag, created.body.price, created.body.active], [201, 'Drone', 'Videography', 15000, true])
    assert.deepEqual(await call('POST', '/api/services', { name: 'X', price: 1, studio_id: 'x' }), { status: 400, body: { error: 'Unknown fields: studio_id' } })
    assert.deepEqual(await call('POST', '/api/services', { name: 'X', price: 1, description: 'x' }), { status: 400, body: { error: 'Unknown fields: description' } })
    assert.equal((await call('PATCH', `/api/services/${created.body.id}`, { active: false })).body.active, false)
    assert.deepEqual((await call('GET', '/api/services', undefined, 'other')).body, [])
    assert.equal((await call('PATCH', `/api/services/${created.body.id}`, { name: 'Mine' }, 'other')).status, 404)
    assert.equal((await call('DELETE', `/api/services/${created.body.id}`, undefined, 'other')).status, 404)
    assert.equal((await call('DELETE', `/api/services/${created.body.id}`)).status, 204)
    assert.deepEqual((await call('GET', '/api/services')).body, [])
  } finally {
    server.close()
  }
})

test('a login without a studio can create one; nobody else can', async () => {
  const { server, call, signups } = await start()
  try {
    assert.deepEqual(await call('POST', '/api/studios', { company: 'Acme', client_code_prefix: 'AC-' }, 'loose'), { status: 201, body: { id: 'new-studio', company: 'Acme' } })
    assert.deepEqual(signups, [['user-loose', { company: 'Acme', clientCodePrefix: 'AC-' }]])
    assert.deepEqual(await call('POST', '/api/studios', { company: 'Second' }), { status: 409, body: { error: 'This login already has a studio' } })
    assert.equal((await call('POST', '/api/studios', { company: 'Acme' }, 'bad')).status, 401)
    assert.deepEqual(await call('POST', '/api/studios', { company: 'Acme', studio_id: 'x' }, 'loose'), { status: 400, body: { error: 'Unknown fields: studio_id' } })
    assert.equal(signups.length, 1)
  } finally {
    server.close()
  }
})

test('api needs a valid token; health does not', async () => {
  const { server, call } = await start()
  try {
    assert.equal((await call('GET', '/health', undefined, '')).status, 200)
    assert.deepEqual(await call('GET', '/api/clients', undefined, 'bad'), { status: 401, body: { error: 'Sign in again' } })
    assert.equal((await call('GET', '/api/clients')).status, 200)
    assert.deepEqual(await call('GET', '/api/clients', undefined, 'loose'), { status: 403, body: { error: 'This login is not linked to a studio' } })
  } finally {
    server.close()
  }
})

test('each login only sees and changes its own studio', async () => {
  const { server, call } = await start()
  try {
    const day = { type: 'Wedding', date: '2026-12-10', venue: 'Pune', services: 'Candid' }
    const mine = (await call('POST', '/api/clients', { client: { name: 'Asha', price: 1000 }, days: [day] })).body
    const theirs = (await call('POST', '/api/clients', { client: { name: 'Ravi', price: 1000 }, days: [day] }, 'other')).body
    assert.deepEqual([mine.code, theirs.code], ['FW-0001', '0001'])
    assert.deepEqual((await call('GET', '/api/clients', undefined, 'other')).body.map((c: { name: string }) => c.name), ['Ravi'])
    assert.equal((await call('PATCH', `/api/clients/${mine.id}`, { notes: 'x' }, 'other')).status, 404)
    assert.equal((await call('GET', '/api/payment-settings', undefined, 'other')).status, 200)
    assert.deepEqual([(await call('GET', '/api/studio')).body, (await call('GET', '/api/studio', undefined, 'other')).body], [{ company: 'Framewise' }, { company: 'Other' }])
    assert.deepEqual((await call('GET', '/api/clients')).body.map((c: { name: string }) => c.name), ['Asha'])
  } finally {
    server.close()
  }
})

test('clients round-trip over http and errors carry their message', async () => {
  const { server, call } = await start()
  try {
    const day = { type: 'Wedding', date: '2026-12-10', venue: 'Pune', services: 'Candid' }
    const created = await call('POST', '/api/clients', { client: { name: 'Asha', price: 1000 }, days: [day] })
    assert.equal(created.status, 201)
    assert.equal(created.body.code, 'FW-0001')
    assert.deepEqual(await call('POST', '/api/clients', { client: { name: 'B', id: 'x' }, days: [day] }), { status: 400, body: { error: 'Unknown fields: id' } })
    assert.deepEqual(await call('POST', '/api/clients', { client: { name: 'B', price: 100, discount: 200 }, days: [day] }), { status: 400, body: { error: 'Discount must be between zero and package price' } })
    assert.deepEqual(await call('POST', `/api/clients/${created.body.id}/events`, { days: [{ ...day, booking_amount: 5000 }] }), { status: 400, body: { error: 'Client payments exceed quotation' } })
    assert.equal((await call('PATCH', `/api/clients/${crypto.randomUUID()}`, { notes: 'x' })).status, 404)
    assert.equal((await call('PATCH', '/api/clients/not-a-uuid', { notes: 'x' })).status, 400)
    assert.equal((await call('PATCH', `/api/clients/${created.body.id}`, { status: 'Nope' })).status, 400)
    const [event] = (await call('GET', '/api/events')).body
    assert.equal((await call('PATCH', `/api/events/${event.id}`, { status: 'Shoot Completed' })).body.status, 'Shoot Completed')
    const pkg = await call('POST', `/api/clients/${created.body.id}/packages`, { name: 'Wedding', price: 1000, events: [event.id], deliverables: 'Teaser\nAlbum' })
    assert.deepEqual([pkg.status, pkg.body.events, pkg.body.items.map((i: { label: string }) => i.label)], [201, [event.id], ['Teaser', 'Album']])
    const paid = await call('POST', '/api/payments', { client_id: created.body.id, package_id: pkg.body.id, amount: 400, paid_on: '2026-10-24', stage: 'On-event' })
    assert.deepEqual([paid.status, paid.body.stage], [201, 'On Event'])
    assert.deepEqual(await call('PUT', `/api/clients/${created.body.id}/stage-plans`, { plan: { 'Booking Amount': 2000 } }), { status: 400, body: { error: 'Stage targets cannot exceed the quotation' } })
    assert.equal((await call('DELETE', `/api/payments/${paid.body.id}`)).status, 404)
    assert.equal((await call('DELETE', `/api/clients/${created.body.id}`)).status, 204)
    assert.deepEqual((await call('GET', '/api/clients')).body, [])
  } finally {
    server.close()
  }
})
