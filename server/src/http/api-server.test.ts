import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { AddressInfo } from 'node:net'
import { ClientService } from '../clients/client-service.ts'
import { PgliteDatabase } from '../db/pglite-database.ts'
import { EnquiryService } from '../enquiries/enquiry-service.ts'
import { EventService } from '../events/event-service.ts'
import { PackageService } from '../packages/package-service.ts'
import { ExpenseService } from '../expenses/expense-service.ts'
import { PaymentService } from '../payments/payment-service.ts'
import { ProjectService } from '../projects/project-service.ts'
import { TaskService } from '../tasks/task-service.ts'
import { TeamService } from '../team/team-service.ts'
import { TermsService } from '../terms/terms-service.ts'
import { PaymentSettings } from '../settings/payment-settings.ts'
import { ApiServer } from './api-server.ts'

async function start() {
  const db = await PgliteDatabase.create()
  const events = new EventService(db, () => '2026-10-24')
  const packages = new PackageService(db)
  const api = new ApiServer({
    auth: { verify: async token => (token === 'good' ? 'user-1' : null) },
    clients: new ClientService(db, events, packages),
    events,
    enquiries: new EnquiryService(db),
    packages,
    payments: new PaymentService(db),
    team: new TeamService(db),
    expenses: new ExpenseService(db),
    projects: new ProjectService(db),
    tasks: new TaskService(db),
    terms: new TermsService(db),
    paymentSettings: new PaymentSettings(db),
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
    assert.equal(created.body.code, 'WC-0001')
    assert.deepEqual(await call('POST', '/api/clients', { client: { name: 'B', id: 'x' }, days: [day] }), { status: 400, body: { error: 'Unknown fields: id' } })
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
