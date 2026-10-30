import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Row } from '../db/database.ts'
import type { DeliveryItemRow } from '../db/rows.ts'
import { DeliveryEdits, type StatusEdit } from './delivery-edits.ts'

const { Store } = await import(new URL('../../../legacy/dist/store.js', import.meta.url).href)

const item = (over: Partial<DeliveryItemRow> = {}): DeliveryItemRow => ({
  id: 'i1', package_id: 'p1', kind: 'deliverable', label: 'Album', position: 0, quantity: null, duration: null, status: 'Not set',
  delivered_quantity: null, delivered_date: null, notes: null, needs_review: false, retired_at: null, ...over,
})

test('delivery status updates match legacy updatePackageDelivery, errors included', () => {
  const cases: [Partial<DeliveryItemRow>, Omit<StatusEdit, 'id'>][] = [
    [{}, { status: 'Yes', delivered_date: '2026-10-20', notes: 'given' }],
    [{ quantity: 3 }, { status: 'Yes' }],
    [{ quantity: 3 }, { status: 'Partial', delivered_quantity: 2 }],
    [{ quantity: 3 }, { status: 'Partial', delivered_quantity: 3 }],
    [{}, { status: 'Partial', delivered_quantity: 1 }],
    [{ quantity: 2, delivered_quantity: 1, status: 'Partial' }, { status: 'No' }],
    [{ quantity: 2 }, { status: 'In progress', delivered_quantity: 5 }],
    [{}, { status: 'Done' }],
    [{ delivered_date: '2026-10-01' }, { status: 'Yes' }],
    [{}, { status: 'Yes', delivered_date: '2026-02-30' }],
    [{ needs_review: true }, { status: 'Yes', resolve: true }],
  ]
  for (const [over, edit] of cases) {
    const row = item(over)
    assert.deepEqual(ported(row, edit), legacy(row, edit), JSON.stringify([over, edit]))
  }
})

test('item edits keep identity rules and protect delivered quantities', () => {
  const previous = [item({ id: 'a', quantity: 4, delivered_quantity: 2, status: 'Partial' }), item({ id: 'b', label: 'Teaser' })]
  const { items, retired } = DeliveryEdits.items(previous, [{ id: 'a', kind: 'deliverable', label: ' Album ', quantity: '5' }, { kind: 'complimentary', label: 'Frame' }])
  assert.deepEqual(items, [
    { id: 'a', kind: 'deliverable', label: 'Album', quantity: 5, duration: null, position: 0 },
    { id: null, kind: 'complimentary', label: 'Frame', quantity: null, duration: null, position: 1 },
  ])
  assert.deepEqual(retired, ['b'])
  assert.throws(() => DeliveryEdits.items(previous, [{ id: 'zzz', kind: 'deliverable', label: 'X' }]), /Invalid delivery item identity/)
  assert.throws(() => DeliveryEdits.items(previous, [{ id: 'b', kind: 'deliverable', label: 'X' }, { id: 'b', kind: 'deliverable', label: 'Y' }]), /Invalid delivery item identity/)
  assert.throws(() => DeliveryEdits.items(previous, [{ id: 'a', kind: 'deliverable', label: 'Album', quantity: 2 }]), /partially delivered/)
  assert.throws(() => DeliveryEdits.items([item({ id: 'c', quantity: 4, delivered_quantity: 3, status: 'Yes' })], [{ id: 'c', kind: 'deliverable', label: 'A', quantity: 2 }]), /below already delivered/)
  assert.throws(() => DeliveryEdits.items([], [{ kind: 'gift', label: 'A' }]), /positive whole quantity/)
  assert.throws(() => DeliveryEdits.items([], [{ kind: 'deliverable', label: 'A', quantity: 1.5 }]), /positive whole quantity/)
})

function ported(row: DeliveryItemRow, edit: Omit<StatusEdit, 'id'>): Row | string {
  try {
    const set = DeliveryEdits.status(row, { id: row.id, ...edit })
    return { status: set.status, deliveredQuantity: set.delivered_quantity, deliveredDate: set.delivered_date || '', notes: set.notes || '', needsReview: set.needs_review ?? row.needs_review }
  } catch (e) {
    return (e as Error).message
  }
}

function legacy(row: DeliveryItemRow, edit: Omit<StatusEdit, 'id'>): Row | string {
  const values = new Map<string, string>()
  const store = new Store({ getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => values.set(k, v) })
  const legacyItem: Row = { id: row.id, kind: row.kind, label: row.label, status: row.status, quantity: row.quantity ?? undefined }
  if (row.delivered_quantity !== null) legacyItem.deliveredQuantity = row.delivered_quantity
  if (row.delivered_date) legacyItem.deliveredDate = row.delivered_date
  if (row.needs_review) legacyItem.needsReview = true
  store.data.packages = [{ id: 'p1', client: 'c1', name: 'P', price: 0, discount: 0, events: [], delivery: { items: [legacyItem] } }]
  const value: Row = { [row.id]: edit.status }
  if (edit.delivered_quantity !== undefined) value[row.id + '-delivered'] = edit.delivered_quantity
  if (edit.delivered_date !== undefined) value[row.id + '-date'] = edit.delivered_date
  if (edit.notes !== undefined) value[row.id + '-notes'] = edit.notes
  if (edit.resolve) value['resolve-' + row.id] = 'on'
  try {
    store.updatePackageDelivery('p1', value)
  } catch (e) {
    return (e as Error).message
  }
  const i = store.data.packages[0].delivery.items[0]
  return { status: i.status, deliveredQuantity: i.deliveredQuantity, deliveredDate: i.deliveredDate || '', notes: i.notes || '', needsReview: !!i.needsReview }
}
