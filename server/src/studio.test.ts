import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseError } from './db/database-error.ts'
import { PgliteDatabase } from './db/pglite-database.ts'
import type { StudioServices } from './http/api-server.ts'
import { HttpError } from './http/http-error.ts'
import { Studio } from './studio.ts'

const today = () => '2026-10-24'
const day = { type: 'Wedding', date: '2026-12-10', venue: 'Pune', services: 'Candid' }

test('a studio cannot list, read, change, delete or link another studio’s records', async () => {
  const db = await PgliteDatabase.create()
  const otherId = (await db.pg.query<{ id: string }>(`insert into studios (company) values ('Other') returning id`)).rows[0].id
  const a = Studio.services(db, today)
  const b = Studio.services(db.forStudio(otherId), today)

  const client = await a.clients.create({ name: 'Asha', price: 100000 }, [day])
  const [event] = await a.events.list()
  const pkg = await a.packages.create(client.id as string, { name: 'Wedding', price: 50000, events: [event.id], deliverables: 'Teaser' })
  const payment = await a.payments.create({ client_id: client.id, package_id: pkg.id, amount: 1000, paid_on: '2026-10-24', stage: 'Booking' })
  const receipt = await a.invoices.issueReceipt(payment.id as string)
  await a.payments.setStagePlan(client.id as string, { 'Booking Amount': 1000 })
  const enquiry = await a.enquiries.create({ name: 'Ravi', status: 'Confirmed' })
  const member = await a.team.addMember({ name: 'Meera', role: 'Photographer' })
  const assignment = await a.team.assign({ event_id: event.id, member_id: member.id, service: 'Candid', charge: 0, paid: 0 })
  await a.events.update(event.id, { status: 'Shoot Completed' })
  const [project] = await a.projects.list()
  const task = await a.tasks.create({ title: 'Call', due: '2026-10-30', event_id: event.id })
  const expense = await a.expenses.create({ title: 'Fuel', amount: 10, spent_on: '2026-10-24', client_id: client.id, event_id: event.id })
  const term = await a.terms.create({ title: 'Delivery', body: 'Within 30 days' })
  const before = await everything(a, client.id as string)
  for (const [list, rows] of Object.entries(before)) if (list !== 'deleted') assert.ok(rows.length, `studio A has ${list}`)

  assert.deepEqual(await everything(b, client.id as string), EMPTY)
  assert.equal((await b.paymentSettings.get()).next_invoice, 1)

  const id = (row: { id?: unknown }) => row.id as string
  const attempts: [string, () => Promise<unknown>][] = [
    ['clients.update', () => b.clients.update(id(client), { notes: 'x' })],
    ['clients.remove', () => b.clients.remove(id(client))],
    ['clients.restore', () => b.clients.restore(id(client))],
    ['clients.reorder', () => b.clients.reorder([id(client)])],
    ['events.update', () => b.events.update(event.id, { notes: 'x' })],
    ['events.remove', () => b.events.remove(event.id)],
    ['events.setTeamRole', () => b.events.setTeamRole(event.id, id(member), 'Photographer')],
    ['events.addDays', () => b.events.addDays(id(client), [day])],
    ['enquiries.update', () => b.enquiries.update(id(enquiry), { notes: 'x' })],
    ['enquiries.remove', () => b.enquiries.remove(id(enquiry))],
    ['enquiries.convert', () => b.enquiries.convert(id(enquiry))],
    ['packages.create', () => b.packages.create(id(client), { name: 'X', price: 1 })],
    ['packages.update', () => b.packages.update(pkg.id, { name: 'X' })],
    ['packages.saveItems', () => b.packages.saveItems(pkg.id, [])],
    ['packages.updateDelivery', () => b.packages.updateDelivery(pkg.id, { drive_link: null })],
    ['payments.create', () => b.payments.create({ client_id: id(client), amount: 1, paid_on: '2026-10-24' })],
    ['payments.edit', () => b.payments.edit(id(payment), { notes: 'x' })],
    ['payments.setStagePlan', () => b.payments.setStagePlan(id(client), {})],
    ['invoices.get', () => b.invoices.get(id(receipt))],
    ['invoices.issueReceipt', () => b.invoices.issueReceipt(id(payment))],
    ['team.updateMember', () => b.team.updateMember(id(member), { name: 'X' })],
    ['team.removeMember', () => b.team.removeMember(id(member))],
    ['team.assign', () => b.team.assign({ event_id: event.id, member_id: id(member), service: 'Drone', charge: 0, paid: 0 })],
    ['team.updateAssignment', () => b.team.updateAssignment(id(assignment), { charge: 0 })],
    ['team.unassign', () => b.team.unassign(id(assignment))],
    ['projects.update', () => b.projects.update(project.id, { notes: 'x' })],
    ['projects.remove', () => b.projects.remove(project.id)],
    ['tasks.create', () => b.tasks.create({ title: 'X', due: '2026-10-30', client_id: id(client) })],
    ['tasks.update', () => b.tasks.update(id(task), { title: 'X' })],
    ['tasks.remove', () => b.tasks.remove(id(task))],
    ['expenses.create', () => b.expenses.create({ title: 'X', amount: 1, spent_on: '2026-10-24', client_id: id(client) })],
    ['expenses.update', () => b.expenses.update(id(expense), { title: 'X' })],
    ['expenses.remove', () => b.expenses.remove(id(expense))],
    ['terms.update', () => b.terms.update(id(term), { title: 'X' })],
    ['terms.remove', () => b.terms.remove(id(term))],
  ]
  for (const [name, attempt] of attempts) await assert.rejects(attempt(), (e: Error) => e instanceof HttpError || e instanceof DatabaseError || assert.fail(`${name}: ${e}`))

  assert.deepEqual(await everything(a, client.id as string), before)
  assert.deepEqual(await everything(b, client.id as string), EMPTY)
})

const EMPTY = { clients: [], deleted: [], events: [], enquiries: [], packages: [], payments: [], stagePlans: [], team: [], assignments: [], expenses: [], projects: [], tasks: [], terms: [], documents: [] }

async function everything(s: StudioServices, clientId: string) {
  return {
    clients: await s.clients.list(),
    deleted: await s.clients.deleted(),
    events: await s.events.list(),
    enquiries: await s.enquiries.list(),
    packages: await s.packages.list(),
    payments: await s.payments.list(),
    stagePlans: await s.payments.stagePlans(),
    team: await s.team.members(),
    assignments: await s.team.assignments(),
    expenses: await s.expenses.list(),
    projects: await s.projects.list(),
    tasks: await s.tasks.list(),
    terms: await s.terms.list(),
    documents: await s.invoices.clientDocuments(clientId),
  }
}
