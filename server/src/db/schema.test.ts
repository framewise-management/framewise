import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { PGlite } from '@electric-sql/pglite'
import { Pricing, type PricedPackage, type QuotedClient, type QuotedEvent } from '@framewise/shared/pricing.ts'
import { PgliteDatabase } from './pglite-database.ts'

test('migrations apply and seed one settings row', async () => {
  const db = await freshDb()
  assert.deepEqual((await db.query('select company, next_invoice from settings')).rows, [{ company: 'Framewise', next_invoice: 1 }])
  assert.equal(await clientCode(db, await addClient(db)), 'WC-0001')
  assert.equal(await clientCode(db, await addClient(db)), 'WC-0002')
})

test('row checks reject bad values', async () => {
  const db = await freshDb()
  const client = await addClient(db, 100000)
  const member = await one(db, `insert into team_members (name) values ('Asha') returning id`)
  const event = await one(db, `insert into events (client_id, type, time_not_recorded) values ($1, 'Wedding', true) returning id`, [client])
  await rejects(db, `insert into clients (name, price, discount) values ('X', 100, 101)`, 'check')
  await rejects(db, `insert into clients (name) values ('  ')`, 'check')
  await rejects(db, `insert into payments (client_id, amount, paid_on) values ($1, 0, '2026-10-24')`, 'check', [client])
  await rejects(db, `insert into payments (client_id, amount) values ($1, 10)`, 'check', [client])
  await rejects(db, `insert into assignments (event_id, member_id, charge, paid) values ($1, $2, 5000, 6000)`, 'check', [event, member])
  await rejects(db, `insert into events (client_id, type, start_time, end_time) values ($1, 'Haldi', '18:00', '10:00')`, 'check', [client])
  await rejects(db, `insert into packages (client_id, name, drive_link) values ($1, 'P', 'http://x')`, 'check', [client])
  await rejects(db, `insert into projects (event_id, stage_names) values ($1, '{Edit,Completed}')`, 'check', [event])
})

test('payments cannot exceed the quote, whichever pricing model applies', async () => {
  const db = await freshDb()
  const shared = await addClient(db, 100000, 10000)
  await pay(db, shared, 90000)
  await rejects(db, `insert into payments (client_id, amount, paid_on) values ($1, 1, '2026-10-24')`, 'Client payments exceed quotation', [shared])
  await rejects(db, `update clients set discount = 20000 where id = $1`, 'Client payments exceed quotation', [shared])

  const packaged = await addClient(db)
  const pkg = await one(db, `insert into packages (client_id, name, price, discount) values ($1, 'Wedding', 50000, 5000) returning id`, [packaged])
  await one(db, `insert into packages (client_id, name, price) values ($1, 'Pre-wedding', 20000) returning id`, [packaged])
  await rejects(db, `insert into payments (client_id, package_id, amount, paid_on) values ($1, $2, 45001, '2026-10-24')`, 'Package receipts exceed quotation', [packaged, pkg])
  await db.query(`insert into payments (client_id, package_id, amount, paid_on) values ($1, $2, 45000, '2026-10-24')`, [packaged, pkg])

  const perDay = await addClient(db, 0, 0, 'Per day')
  const day = await one(db, `insert into events (client_id, type, time_not_recorded, quotation) values ($1, 'Haldi', true, 30000) returning id`, [perDay])
  await rejects(db, `insert into payments (client_id, event_id, amount, paid_on) values ($1, $2, 30001, '2026-10-24')`, 'exceed', [perDay, day])
  await db.query(`insert into payments (client_id, event_id, amount, paid_on) values ($1, $2, 30000, '2026-10-24')`, [perDay, day])
  await rejects(db, `update events set quotation = 20000 where id = $1`, 'exceed', [day])
})

test('links must stay within one client and one package', async () => {
  const db = await freshDb()
  const a = await addClient(db, 100000)
  const b = await addClient(db, 100000)
  const eventOfB = await one(db, `insert into events (client_id, type, time_not_recorded) values ($1, 'Wedding', true) returning id`, [b])
  const pkgOfA = await one(db, `insert into packages (client_id, name, price) values ($1, 'P', 50000) returning id`, [a])
  await rejects(db, `insert into payments (client_id, event_id, amount, paid_on) values ($1, $2, 10, '2026-10-24')`, 'foreign key', [a, eventOfB])
  await rejects(db, `insert into events (client_id, package_id, type, time_not_recorded) values ($1, $2, 'Haldi', true)`, 'foreign key', [b, pkgOfA])
  const looseEvent = await one(db, `insert into events (client_id, type, time_not_recorded) values ($1, 'Haldi', true) returning id`, [a])
  await rejects(db, `insert into payments (client_id, event_id, package_id, amount, paid_on) values ($1, $2, $3, 10, '2026-10-24')`, 'not part of its package', [a, looseEvent, pkgOfA])
})

test('invoice numbers follow the settings, skip taken numbers and never repeat', async () => {
  const db = await freshDb()
  const client = await addClient(db, 100000)
  const payment = await pay(db, client, 1000)
  const issue = (kind: string, extra = '') =>
    db.query<{ number: string; sequence: number }>(`insert into invoices (client_id, document_kind, payment_id, client_invoice, snapshot${extra ? ', number' : ''}) values ($1, $2, $3, $4, '{}'${extra ? `, '${extra}'` : ''}) returning number, sequence`, [client, kind, kind === 'invoice' ? null : payment, kind === 'invoice'])
  assert.deepEqual((await issue('invoice')).rows[0], { number: '000001', sequence: 1 })
  await issue('invoice', '000002')
  await db.query(`update settings set invoice_prefix = 'WC-', invoice_padding = 4`)
  assert.equal((await issue('receipt')).rows[0].number, 'WC-0002')
  await rejects(db, `insert into invoices (client_id, document_kind, payment_id, snapshot) values ($1, 'receipt', $2, '{}')`, 'unique', [client, payment])
  assert.equal((await db.query<{ next_invoice: number }>('select next_invoice from settings')).rows[0].next_invoice, 3)
})

test('editing or deleting a payment leaves an audit row', async () => {
  const db = await freshDb()
  const client = await addClient(db, 100000)
  const payment = await pay(db, client, 1000)
  await db.query(`update payments set amount = 2000 where id = $1`, [payment])
  await db.query(`delete from payments where id = $1`, [payment])
  const rows = (await db.query<{ before: { amount: number }; after: { amount: number } | null }>('select before, after from payment_audit order by changed_at')).rows
  assert.deepEqual(rows.map(r => [Number(r.before.amount), r.after && Number(r.after.amount)]), [[1000, 2000], [2000, null]])
})

test('apply_changes commits all changes or none', async () => {
  const db = await PgliteDatabase.create()
  const id = crypto.randomUUID()
  const [[client], events] = await db.apply([
    { op: 'insert', table: 'clients', row: { id, name: 'Asha', price: 100000 } },
    { op: 'insert', table: 'events', row: { client_id: id, type: 'Wedding', services: ['Candid'], start_time: '09:00', end_time: '18:00' } },
  ])
  assert.equal(client.code, 'WC-0001')
  assert.equal(client.price, 100000)
  assert.deepEqual(events[0].services, ['Candid'])
  await db.apply([{ op: 'update', table: 'clients', match: { id }, set: { status: 'Booked' } }])

  const fail = (changes: Parameters<PgliteDatabase['apply']>[0], message: string) =>
    assert.rejects(db.apply(changes), (e: Error) => e.message.includes(message) || assert.fail(e.message))
  await fail([
    { op: 'insert', table: 'payments', row: { client_id: id, amount: 5000, paid_on: '2026-10-24' } },
    { op: 'insert', table: 'payments', row: { client_id: id, amount: 96000, paid_on: '2026-10-24' } },
  ], 'Client payments exceed quotation')
  await fail([
    { op: 'update', table: 'clients', match: { id }, set: { status: 'Lost' } },
    { op: 'update', table: 'clients', match: { id: crypto.randomUUID() }, set: { status: 'Lost' } },
  ], 'Record not found')
  await fail([{ op: 'update', table: 'clients', match: { id }, set: { code: 'X', hacked: true } }], 'Unknown columns on clients: hacked')
  await fail([{ op: 'insert', table: 'payment_audit', row: { payment_id: id, before: {} } }], 'Unknown table')
  assert.deepEqual(await db.select('payments'), [])
  assert.equal((await db.select<{ status: string }>('clients', { id }))[0].status, 'Booked')
  assert.deepEqual(await db.apply([{ op: 'delete', table: 'events', match: { client_id: crypto.randomUUID() }, optional: true }]), [[]])
})

test('client_quote in SQL matches Pricing.quote in shared/', async () => {
  const db = await freshDb()
  const cases: [QuotedClient & { price: number; discount: number }, PricedPackage[], QuotedEvent[]][] = [
    [{ price: 150000, discount: 0 }, [], [{ quotation: 40000 }]],
    [{ financeMode: 'Shared', price: 150000, discount: 25000 }, [], []],
    [{ financeMode: 'Per day', price: 150000, discount: 0 }, [], [{ quotation: 40000 }, { quotation: 60000 }, {}]],
    [{ financeMode: 'Per day', price: 150000, discount: 0 }, [{ price: 90000, discount: 10000 }, { price: 50000 }], [{ quotation: 40000 }]],
    [{ price: 0, discount: 0 }, [], []],
  ]
  for (const [client, packages, events] of cases) {
    const id = await addClient(db, client.price, client.discount, client.financeMode)
    for (const p of packages) await db.query(`insert into packages (client_id, name, price, discount) values ($1, 'P', $2, $3)`, [id, p.price, p.discount ?? 0])
    for (const e of events) await db.query(`insert into events (client_id, type, time_not_recorded, quotation) values ($1, 'Day', true, $2)`, [id, e.quotation ?? null])
    const sql = Number(await one(db, 'select client_quote($1) as id', [id]))
    assert.equal(sql, Pricing.quote({ ...client, amount: client.price - client.discount }, packages, events), JSON.stringify(client))
  }
})

async function freshDb(): Promise<PGlite> {
  return (await PgliteDatabase.create()).pg
}

async function one(db: PGlite, sql: string, params: unknown[] = []): Promise<string> {
  return (await db.query<{ id: string }>(sql, params)).rows[0].id
}

function addClient(db: PGlite, price = 0, discount = 0, financeMode = 'Shared'): Promise<string> {
  return one(db, `insert into clients (name, price, discount, finance_mode) values ('Client', $1, $2, $3) returning id`, [price, discount, financeMode])
}

async function clientCode(db: PGlite, id: string): Promise<string> {
  return (await db.query<{ code: string }>('select code from clients where id = $1', [id])).rows[0].code
}

function pay(db: PGlite, client: string, amount: number): Promise<string> {
  return one(db, `insert into payments (client_id, amount, paid_on) values ($1, $2, '2026-10-24') returning id`, [client, amount])
}

async function rejects(db: PGlite, sql: string, message: string, params: unknown[] = []): Promise<void> {
  await assert.rejects(db.query(sql, params), (e: Error) => e.message.includes(message) || assert.fail(`expected "${message}", got "${e.message}"`), sql)
}
