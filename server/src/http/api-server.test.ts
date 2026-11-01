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
  const api = new ApiServer({
    auth: { verify: async token => (token in studios ? { userId: 'user-' + token, studioId: studios[token] } : null) },
    servicesFor: studioId => Studio.services(db.forStudio(studioId), () => '2026-10-24'),
  })
  const server = await api.listen(0)
  const base = `http://localhost:${(server.address() as AddressInfo).port}`
  const call = async (method: string, path: string, body?: unknown, token = 'good') => {
    const res = await fetch(base + path, { method, headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: body === undefined ? undefined : JSON.stringify(body) })
    const json: any = res.status === 204 ? null : await res.json()
    return { status: res.status, body: json }
  }
  return { server, call }
}

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
