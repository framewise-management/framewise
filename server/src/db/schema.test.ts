import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { Booking } from '@framewise/shared/booking.ts'
import { DeliveryItems } from '@framewise/shared/delivery-items.ts'
import { Pricing, type PricedPackage, type QuotedClient, type QuotedEvent } from '@framewise/shared/pricing.ts'
import { StudioLists } from '@framewise/shared/studio-lists.ts'
import { PgliteDatabase } from './pglite-database.ts'

test('migrations apply and create the first studio', async () => {
  const db = await freshDb()
  assert.deepEqual((await db.query('select company, next_invoice, client_code_prefix from studios')).rows, [{ company: 'Framewise', next_invoice: 1, client_code_prefix: 'FW-' }])
  assert.equal(await clientCode(db, await addClient(db)), 'FW-0001')
  assert.equal(await clientCode(db, await addClient(db)), 'FW-0002')
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

test('invoice numbers follow the studio settings, skip taken numbers and never repeat', async () => {
  const db = await freshDb()
  const client = await addClient(db, 100000)
  const payment = await pay(db, client, 1000)
  const issue = (kind: string, extra = '') =>
    db.query<{ number: string; sequence: number }>(`insert into invoices (client_id, document_kind, payment_id, client_invoice, snapshot${extra ? ', number' : ''}) values ($1, $2, $3, $4, '{}'${extra ? `, '${extra}'` : ''}) returning number, sequence`, [client, kind, kind === 'invoice' ? null : payment, kind === 'invoice'])
  assert.deepEqual((await issue('invoice')).rows[0], { number: '000001', sequence: 1 })
  await issue('invoice', '000002')
  await db.query(`update studios set invoice_prefix = 'WC-', invoice_padding = 4`)
  assert.equal((await issue('receipt')).rows[0].number, 'WC-0002')
  await rejects(db, `insert into invoices (client_id, document_kind, payment_id, snapshot) values ($1, 'receipt', $2, '{}')`, 'unique', [client, payment])
  assert.equal((await db.query<{ next_invoice: number }>('select next_invoice from studios')).rows[0].next_invoice, 3)
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
  assert.equal(client.code, 'FW-0001')
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

test('SQL check lists match the lists in shared/', async () => {
  const db = await freshDb()
  const pairs: [string, string, readonly string[]][] = [
    ['clients', 'status', Booking.clientStatuses],
    ['enquiries', 'status', Booking.enquiryStatuses],
    ['events', 'booking_status', Booking.clientStatuses],
    ['delivery_items', 'status', DeliveryItems.statuses],
    ['payments', 'method', StudioLists.paymentMethods],
  ]
  for (const [table, column, list] of pairs)
    assert.deepEqual(await checkList(db, table, column), [...list].sort(), `${table}.${column}`)
})

async function checkList(db: PGlite, table: string, column: string): Promise<string[]> {
  const { rows } = await db.query<{ def: string }>(`select pg_get_constraintdef(oid) as def from pg_constraint where conrelid = $1::regclass and contype = 'c'`, [table])
  const defs = rows.map(r => r.def).filter(d => d.includes(`(${column} = ANY`))
  assert.equal(defs.length, 1, `one list check on ${table}.${column}`)
  return [...defs[0].matchAll(/'([^']*)'::text/g)].map(m => m[1]).sort()
}

test('each studio numbers its own clients and invoices', async () => {
  const db = await freshDb()
  const second = await one(db, `insert into studios (company, client_code_prefix, invoice_prefix) values ('Second', 'SB-', 'INV') returning id`)
  const a = await addClient(db, 1000)
  const b = await one(db, `insert into clients (studio_id, name, price) values ($1, 'B', 1000) returning id`, [second])
  assert.deepEqual([await clientCode(db, a), await clientCode(db, b)], ['FW-0001', 'SB-0001'])
  const paidA = await pay(db, a, 10)
  const paidB = await one(db, `insert into payments (studio_id, client_id, amount, paid_on) values ($1, $2, 10, '2026-10-24') returning id`, [second, b])
  const numberA = (await db.query<{ number: string }>(`insert into invoices (client_id, document_kind, payment_id, snapshot) values ($1, 'receipt', $2, '{}') returning number`, [a, paidA])).rows[0].number
  const numberB = (await db.query<{ number: string }>(`insert into invoices (studio_id, client_id, document_kind, payment_id, snapshot) values ($1, $2, 'receipt', $3, '{}') returning number`, [second, b, paidB])).rows[0].number
  assert.deepEqual([numberA, numberB], ['000001', 'INV000001'])
})

test('links cannot point into another studio', async () => {
  const db = await freshDb()
  const second = await one(db, `insert into studios (company) values ('Second') returning id`)
  const client = await addClient(db, 1000)
  const member = await one(db, `insert into team_members (name) values ('Asha') returning id`)
  await rejects(db, `insert into events (studio_id, client_id, type, time_not_recorded) values ($1, $2, 'Wedding', true)`, 'foreign key', [second, client])
  await rejects(db, `insert into expenses (studio_id, title, amount, spent_on, client_id) values ($1, 'Fuel', 10, '2026-10-24', $2)`, 'foreign key', [second, client])
  await rejects(db, `insert into tasks (studio_id, title, due, owner_id) values ($1, 'Call', '2026-10-24', $2)`, 'foreign key', [second, member])
})

test('apply_changes stamps every write with its studio and never reaches another studio', async () => {
  const first = await PgliteDatabase.create()
  const secondId = (await first.pg.query<{ id: string }>(`insert into studios (company) values ('Second') returning id`)).rows[0].id
  const second = first.forStudio(secondId)
  const [[client]] = await second.apply([{ op: 'insert', table: 'clients', row: { name: 'B', studio_id: first.studioId } }])
  assert.deepEqual([client.studio_id, client.code], [secondId, '0001'])
  assert.deepEqual(await first.select('clients'), [])
  await assert.rejects(first.apply([{ op: 'update', table: 'clients', match: { id: client.id }, set: { name: 'X' } }]), /Record not found/)
  await assert.rejects(first.apply([{ op: 'delete', table: 'clients', match: { id: client.id } }]), /Record not found/)
  await assert.rejects(second.apply([{ op: 'update', table: 'clients', match: { id: client.id }, set: { studio_id: first.studioId } }]), /cannot move between studios/)
  await second.apply([{ op: 'update', table: 'studios', match: { id: first.studioId }, set: { company: 'Second Studio' } }])
  assert.deepEqual([(await first.select<{ company: string }>('studios'))[0].company, (await second.select<{ company: string }>('studios'))[0].company], ['Framewise', 'Second Studio'])
  await assert.rejects(second.apply([{ op: 'insert', table: 'studios', row: { company: 'X' } }]), /cannot be created or deleted/)
  await assert.rejects(first.forStudio(crypto.randomUUID()).apply([{ op: 'insert', table: 'terms', row: { title: 'T', body: 'B' } }]), /Unknown studio/)
})

test('the studios migration moves the existing studio, its numbering and its WC- codes', async () => {
  const pg = new PGlite()
  await pg.exec('create role anon; create role authenticated; create role service_role;')
  const files = (await readdir(MIGRATIONS)).filter(f => f.endsWith('.sql')).sort()
  const at = files.indexOf('20261102000000_studios.sql')
  for (const file of files.slice(0, at)) await pg.exec(await readFile(new URL(file, MIGRATIONS), 'utf8'))

  await pg.exec(`update settings set company = 'Studio One', invoice_prefix = 'R-', invoice_padding = 4`)
  const clients = [await one(pg, `insert into clients (name, price) values ('A', 1000) returning id`), await one(pg, `insert into clients (name) values ('B') returning id`), await one(pg, `insert into clients (name) values ('C') returning id`)]
  const payment = await one(pg, `insert into payments (client_id, amount, paid_on) values ($1, 100, '2026-10-24') returning id`, [clients[0]])
  await pg.query(`insert into invoices (client_id, document_kind, payment_id, snapshot) values ($1, 'receipt', $2, '{"client": {"code": "WC-0001"}}')`, [clients[0], payment])
  const before = (await pg.query<{ updated_at: string }>('select updated_at from clients order by created_at')).rows

  await pg.exec(await readFile(new URL(files[at], MIGRATIONS), 'utf8'))

  const studio = (await pg.query<Record<string, unknown>>('select id, company, invoice_prefix, invoice_padding, next_invoice, client_code_prefix, next_client_code from studios')).rows
  assert.equal(studio.length, 1)
  assert.deepEqual({ ...studio[0], id: undefined }, { id: undefined, company: 'Studio One', invoice_prefix: 'R-', invoice_padding: 4, next_invoice: 2, client_code_prefix: 'FW-', next_client_code: 4 })
  const id = studio[0].id
  assert.deepEqual((await pg.query<{ code: string }>('select code from clients order by code')).rows.map(r => r.code), ['FW-0001', 'FW-0002', 'FW-0003'])
  for (const table of ['clients', 'payments', 'invoices'])
    assert.deepEqual((await pg.query<{ studio_id: string }>(`select distinct studio_id from ${table}`)).rows, [{ studio_id: id }], table)
  assert.deepEqual((await pg.query('select updated_at from clients order by created_at')).rows, before)
  assert.deepEqual((await pg.query('select * from payment_audit')).rows, [])
  assert.equal((await pg.query<{ code: string }>(`select snapshot->'client'->>'code' as code from invoices`)).rows[0].code, 'WC-0001')
  assert.equal((await pg.query<{ t: string | null }>(`select to_regclass('settings')::text as t`)).rows[0].t, null)

  assert.equal(await one(pg, `insert into clients (studio_id, name) values ($1, 'D') returning code as id`, [id]), 'FW-0004')
  const next = await one(pg, `insert into payments (studio_id, client_id, amount, paid_on) values ($1, $2, 100, '2026-10-24') returning id`, [id, clients[0]])
  assert.equal(await one(pg, `insert into invoices (studio_id, client_id, document_kind, payment_id, snapshot) values ($1, $2, 'receipt', $3, '{}') returning number as id`, [id, clients[0], next]), 'R-0002')
})

const MIGRATIONS = new URL('../../../supabase/migrations/', import.meta.url)

// raw inserts in these tests belong to the first studio unless they name another
async function freshDb(): Promise<PGlite> {
  const db = await PgliteDatabase.create()
  const { rows } = await db.pg.query<{ table_name: string }>(`select table_name from information_schema.columns where table_schema = 'public' and column_name = 'studio_id'`)
  for (const { table_name } of rows) await db.pg.exec(`alter table ${table_name} alter column studio_id set default '${db.studioId}'`)
  return db.pg
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
