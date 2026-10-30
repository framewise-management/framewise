import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DeliveryItems, type DeliveryItem, type DeliveryLines } from './delivery-items.ts'

const legacy = await import(new URL('../../legacy/dist/delivery.js', import.meta.url).href)

const albumYes: DeliveryItem = { id: 'a', kind: 'deliverable', label: 'Bride Album', status: 'Yes', deliveredDate: '2026-10-01' }
const teaser: DeliveryItem = { id: 'b', kind: 'deliverable', label: 'Teaser', status: 'In progress' }
const reels: DeliveryItem = { id: 'c', kind: 'deliverable', label: 'Reels', status: 'Not set', quantity: 3, duration: '60 s' }
const gift: DeliveryItem = { id: 'd', kind: 'complimentary', label: 'Frame', status: 'No' }

test('statuses and item text match legacy', () => {
  assert.deepEqual(DeliveryItems.statuses, legacy.deliveryStatuses)
  for (const i of [albumYes, reels, { ...reels, duration: undefined }, { ...reels, quantity: null }])
    assert.equal(DeliveryItems.text(i), legacy.itemText(i))
})

test('package deliverables match legacy, with and without delivery items', () => {
  const packages = [
    { delivery: { items: [albumYes, reels, gift] } },
    { deliverables: ['Teaser', 'Highlight'], complimentary: ['Frame'] },
    {},
  ]
  for (const p of packages)
    for (const kind of ['deliverable', 'complimentary'] as const)
      assert.deepEqual(DeliveryItems.ofPackage(p, kind), legacy.packageDeliverables(p, kind), JSON.stringify(p) + kind)
})

test('sync keeps ids and statuses exactly like legacy syncPackageDelivery', () => {
  const cases: [DeliveryLines, DeliveryItem[]][] = [
    [{ deliverables: 'Bride Album\nTeaser\nTeaser\n', complimentary: ['Frame'] }, []],
    [{ deliverables: ['Teaser', 'Bride Album'], complimentary: [] }, [albumYes, teaser]],
    [{ deliverables: ['Bride Album', 'Highlight'] }, [albumYes, teaser]],
    [{ deliverables: ['Bride Album'] }, [albumYes, teaser, reels]],
    [{ deliverables: ['3 × Reels (60 s)', 'Teaser'], complimentary: 'Frame\nPhoto book' }, [reels, gift]],
    [{}, [albumYes, gift]],
  ]
  for (const [lines, previous] of cases) {
    const known = new Set(previous.map(i => i.id))
    const p: { deliverables?: string[]; complimentary?: string[]; delivery: { items: DeliveryItem[]; retiredItems?: DeliveryItem[] } } =
      structuredClone({ ...lines, delivery: { items: previous } }) as never
    legacy.syncPackageDelivery(p)
    const synced = DeliveryItems.sync(lines, previous, () => 'NEW')
    const label = JSON.stringify(lines)
    assert.deepEqual(synced.items, p.delivery.items.map((i: DeliveryItem) => known.has(i.id) ? i : { ...i, id: 'NEW' }), label)
    assert.deepEqual(synced.retired, p.delivery.retiredItems || [], label)
    assert.deepEqual(synced.deliverables, p.deliverables, label)
    assert.deepEqual(synced.complimentary, p.complimentary, label)
  }
})
