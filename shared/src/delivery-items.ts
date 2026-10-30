export type DeliveryKind = 'deliverable' | 'complimentary'

export interface DeliveryItem {
  id: string
  kind: DeliveryKind
  label: string
  status: string
  quantity?: number | null
  duration?: string
  deliveredQuantity?: number
  deliveredDate?: string
  notes?: string
  needsReview?: boolean
}

export interface DeliveryLines {
  deliverables?: string | readonly string[]
  complimentary?: string | readonly string[]
}

export interface PackageDeliverables {
  deliverables?: readonly string[]
  complimentary?: readonly string[]
  delivery?: { items?: readonly DeliveryItem[] }
}

export interface SyncedDelivery {
  items: DeliveryItem[]
  retired: DeliveryItem[]
  deliverables: string[]
  complimentary: string[]
}

export class DeliveryItems {
  static readonly statuses: readonly string[] = ['Not set', 'No', 'In progress', 'Partial', 'Yes', 'Not required']

  static text(i: Pick<DeliveryItem, 'label' | 'quantity' | 'duration'>): string {
    return (i.quantity ? i.quantity + ' × ' : '') + i.label + (i.duration ? ' (' + i.duration + ')' : '')
  }

  static ofPackage(p: PackageDeliverables, kind: DeliveryKind = 'deliverable'): string[] {
    if (p.delivery?.items) return p.delivery.items.filter(i => i.kind === kind).map(i => DeliveryItems.text(i))
    return [...(kind === 'complimentary' ? p.complimentary || [] : p.deliverables || [])]
  }

  // rebuilds items from the edited text lines, keeping ids and statuses of items that still match
  static sync(lines: DeliveryLines, previous: readonly DeliveryItem[], newId: () => string = () => crypto.randomUUID()): SyncedDelivery {
    const items: DeliveryItem[] = []
    for (const [kind, labels] of [['deliverable', uniqueLines(lines.deliverables)], ['complimentary', uniqueLines(lines.complimentary)]] as const) {
      const old = previous.filter(i => i.kind === kind)
      const used = new Set<string>()
      for (const [index, label] of labels.entries()) {
        let item = old.find(i => DeliveryItems.text(i) === label && !used.has(i.id))
        // same number of lines and the old one is gone: treat it as a rename
        if (!item && old.length === labels.length && old[index] && !used.has(old[index].id) && !labels.includes(old[index].label)) item = old[index]
        if (item) used.add(item.id)
        items.push({
          ...item,
          id: item?.id || newId(),
          kind,
          label: item && DeliveryItems.text(item) === label ? item.label : label,
          status: item?.status || 'Not set',
        })
      }
    }
    return {
      items,
      retired: previous.filter(i => !items.some(x => x.id === i.id)),
      deliverables: items.filter(i => i.kind === 'deliverable').map(i => DeliveryItems.text(i)),
      complimentary: items.filter(i => i.kind === 'complimentary').map(i => DeliveryItems.text(i)),
    }
  }
}

function uniqueLines(value: string | readonly string[] | undefined): string[] {
  return [...new Set((Array.isArray(value) ? value : String(value || '').split('\n')).map(x => String(x).trim()).filter(Boolean))]
}
