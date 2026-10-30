import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PgliteDatabase } from '../db/pglite-database.ts'
import { TermsService } from './terms-service.ts'

test('clauses can be added, edited, hidden and deleted', async () => {
  const db = await PgliteDatabase.create()
  const terms = new TermsService(db)
  await assert.rejects(terms.create({ title: ' ', body: 'Text' }), /title/)
  const created = await terms.create({ title: ' Cancellation ', body: ' Terms apply. ' })
  const id = String(created.id)
  assert.deepEqual((await terms.list()).map(t => [t.title, t.body, t.active]), [['Cancellation', 'Terms apply.', true]])
  await terms.update(id, { body: 'Updated', active: false })
  assert.deepEqual((await terms.list()).map(t => [t.body, t.active]), [['Updated', false]])
  await terms.remove(id)
  assert.deepEqual(await terms.list(), [])
})
