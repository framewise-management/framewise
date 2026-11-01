import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { AddressInfo } from 'node:net'
import { ApiServer } from '../http/api-server.ts'
import { Booking } from '@framewise/shared/booking.ts'
import { PgliteDatabase } from '../db/pglite-database.ts'
import { Studio } from '../studio.ts'
import { QuoteService } from './quote-service.ts'

test('fixed-code acceptance books events, creates projects, preserves terms and is repeatable', async () => {
  const db = await PgliteDatabase.create()
  try {
    const { client, quote, services } = await setup(db)
    assert.equal(quote.snapshot.total, 900)
    assert.equal(quote.snapshot.clientName, 'Mira')
    assert.equal(JSON.stringify(await services.quotes.view(quote.token)).includes('Private note'), false)
    await assert.rejects(services.quotes.accept(quote.token, '000000', true), /Incorrect/)
    await assert.rejects(services.quotes.accept(quote.token, '111111', false), /Agree/)
    await assert.rejects(services.quotes.accept(quote.token, 111111, true), /Incorrect/)
    const [term] = await db.select('terms')
    await services.terms.update(String(term.id), { body: 'Changed terms' })
    const [a, b] = await Promise.all([services.quotes.accept(quote.token, '111111', true), services.quotes.accept(quote.token, '111111', true)])
    assert.equal(a.status, 'Accepted'); assert.equal(b.status, 'Accepted')
    assert.equal(a.snapshot.terms[0].body, 'Original terms')
    assert.equal((await db.select('clients', { id: client.id }))[0].status, 'Booked')
    assert.equal((await db.select('enquiries'))[0].status, 'Booked')
    const events = await services.events.list()
    assert.equal(Booking.state({ bookingStatus: events[0].booking_status! }), 'Confirmed')
    const projects = await services.projects.list()
    assert.equal(projects.length, 1)
    assert.deepEqual(projects[0].completed_stages, [])
    assert.equal(projects[0].stage_names[0], 'Upcoming')
    assert.equal((await db.select('payments')).length, 0)
    await services.quotes.accept(quote.token, '111111', true)
    assert.equal((await services.projects.list()).length, 1)
    await services.events.update(events[0].id, { status: 'Shoot Completed' })
    const [progress] = await services.projects.list()
    assert.equal(progress.stage, 1)
    assert.deepEqual(progress.completed_stages, ['Upcoming', 'Shoot Completed'])
    assert.equal((await services.projects.list()).length, 1)
  } finally { await db.pg.close() }
})

test('changed details, replaced links, expiration, deleted clients and other studios cannot accept', async () => {
  const db = await PgliteDatabase.create()
  try {
    const { client, quote, services } = await setup(db)
    await services.clients.update(String(client.id), { price: 2000 })
    await assert.rejects(services.quotes.accept(quote.token, '111111', true), /details changed/)
    assert.equal((await services.quotes.view(quote.token)).status, 'Sent')
    assert.equal((await services.projects.list()).length, 0)
    const replacement = await services.quotes.create(String(client.id))
    await assert.rejects(services.quotes.accept(quote.token, '111111', true), /no longer available/)
    const other = crypto.randomUUID()
    await db.pg.query('insert into studios (id) values ($1)', [other])
    await assert.rejects(new QuoteService(db.forStudio(other)).view(replacement.token), /not found/)
    await assert.rejects(services.quotes.view('not-a-token'), /not found/)
    await db.pg.exec('alter table quotes disable trigger quotes_guard')
    await db.pg.query("update quotes set expires_at = now() - interval '1 day' where id = $1", [replacement.id])
    await db.pg.exec('alter table quotes enable trigger quotes_guard')
    await assert.rejects(services.quotes.accept(replacement.token, '111111', true), /no longer available/)
    await services.clients.remove(String(client.id))
    await assert.rejects(services.quotes.view(replacement.token), /not found/)
  } finally { await db.pg.close() }
})

test('package pricing, deliverables and payment targets are snapshotted for all booked events', async () => {
  const db = await PgliteDatabase.create()
  try {
    const { client, services } = await setup(db)
    await services.events.addDays(String(client.id), [{ type: 'Reception', date: '2027-01-03', venue: 'Garden', services: ['Video'] }])
    const events = await services.events.list()
    await services.packages.create(String(client.id), { name: 'Celebrations', price: 3000, discount: 200, events: events.map(e => e.id), deliverables: 'Album\nHighlight film' })
    await services.payments.setStagePlan(String(client.id), { 'Booking Amount': 1000, 'On Event': 1800 })
    const quote = await services.quotes.create(String(client.id))
    assert.equal(quote.snapshot.total, 2800)
    assert.equal(quote.snapshot.lines[0].deliverables.length, 2)
    assert.equal(quote.snapshot.paymentPlan.length, 2)
    await services.quotes.accept(quote.token, '111111', true)
    assert.equal((await services.projects.list()).length, 2)
    assert.ok((await services.events.list()).every(e => e.booking_status === 'Booked'))
  } finally { await db.pg.close() }
})

test('booking rolls back if project creation fails', async () => {
  const db = await PgliteDatabase.create()
  try {
    const { quote, client, services } = await setup(db)
    await db.pg.exec("create function fail_project() returns trigger language plpgsql as $$ begin raise exception 'project failed'; end $$; create trigger fail_project before insert on projects for each row execute function fail_project();")
    await assert.rejects(services.quotes.accept(quote.token, '111111', true), /project failed/)
    assert.equal((await services.quotes.view(quote.token)).status, 'Sent')
    assert.equal((await db.select('clients', { id: client.id }))[0].status, 'Tentative')
    assert.equal((await db.select('events'))[0].booking_status, null)
  } finally { await db.pg.close() }
})

test('public routes work without staff login and expose only the quote snapshot', async () => {
  const db = await PgliteDatabase.create()
  const api = new ApiServer({ auth: { verify: async () => null }, onboarding: { createForUser: async () => assert.fail('no sign-up here') }, servicesFor: id => Studio.services(db.forStudio(id)) })
  const server = await api.listen(0)
  try {
    const { quote, client } = await setup(db)
    const base = `http://localhost:${(server.address() as AddressInfo).port}/api`
    const path = `${base}/public/quotes/${db.studioId}/${quote.token}`
    const view = await fetch(path)
    assert.equal(view.status, 200)
    assert.equal(view.headers.get('cache-control'), 'no-store')
    const body = await view.json() as { source?: unknown; token?: unknown; snapshot: { clientName: string } }
    assert.equal(body.source, undefined)
    assert.equal(body.token, undefined)
    assert.equal(body.snapshot.clientName, 'Mira')
    assert.equal((await fetch(`${base}/clients/${client.id}/quotes`, { method: 'POST' })).status, 401)
    assert.equal((await fetch(`${path}/accept`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code: '111111', consent: true }) })).status, 200)
    assert.equal((await fetch(`${base}/public/quotes/${crypto.randomUUID()}/${quote.token}`)).status, 404)
  } finally { await new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve())); await db.pg.close() }
})

async function setup(db: PgliteDatabase) {
  const services = Studio.services(db)
  const client = await services.clients.create({ name: 'Mira', price: 1000, discount: 100, status: 'Tentative', notes: 'Private note' }, [{ type: 'Wedding', date: '2027-01-02', venue: 'Hall', services: ['Photography'] }])
  await db.apply([{ op: 'insert', table: 'enquiries', row: { name: 'Mira', client_id: client.id } }])
  await services.terms.create({ title: 'Agreement', body: 'Original terms' })
  const quote = await services.quotes.create(String(client.id))
  return { services, client, quote }
}
