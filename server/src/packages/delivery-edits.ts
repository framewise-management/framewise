import { CalendarDate } from '@framewise/shared/calendar-date.ts'
import { DeliveryItems } from '@framewise/shared/delivery-items.ts'
import type { Row } from '../db/database.ts'
import type { DeliveryItemRow } from '../db/rows.ts'
import { HttpError } from '../http/http-error.ts'

export interface ItemEdit {
  id?: string
  kind?: string
  label?: string
  quantity?: number | string | null
  duration?: string | null
}

export interface StatusEdit {
  id: string
  status?: string
  delivered_quantity?: number | string | null
  delivered_date?: string | null
  notes?: string | null
  resolve?: boolean
}

export interface EditedItem {
  id: string | null
  kind: 'deliverable' | 'complimentary'
  label: string
  quantity: number | null
  duration: string | null
  position: number
}

export class DeliveryEdits {
  // the package's item list as edited; statuses stay, and quantities can't drop below what was already delivered
  static items(previous: readonly DeliveryItemRow[], edits: readonly ItemEdit[]): { items: EditedItem[]; retired: string[] } {
    const seen = new Set<string>()
    const items = edits.map((v, position): EditedItem => {
      if (v.id && (!previous.some(i => i.id === v.id) || seen.has(v.id))) throw new HttpError(400, 'Invalid delivery item identity')
      if (v.id) seen.add(v.id)
      const prev = previous.find(i => i.id === v.id)
      const label = String(v.label || '').trim()
      const quantity = v.quantity === '' || v.quantity === undefined || v.quantity === null ? null : Number(v.quantity)
      if (!label || (v.kind !== 'deliverable' && v.kind !== 'complimentary') || (quantity !== null && (!Number.isInteger(quantity) || quantity < 1)))
        throw new HttpError(400, 'Enter a description and a positive whole quantity')
      if (prev?.status === 'Partial' && (quantity === null || Number(prev.delivered_quantity || 0) >= quantity))
        throw new HttpError(400, 'Keep a quantity above the partially delivered count, or update delivery status first')
      if (quantity !== null && Number(prev?.delivered_quantity || 0) > quantity) throw new HttpError(400, 'Quantity cannot be below already delivered items')
      return { id: v.id || null, kind: v.kind, label, quantity, duration: String(v.duration || '').trim() || null, position }
    })
    return { items, retired: previous.filter(i => !items.some(x => x.id === i.id)).map(i => i.id) }
  }

  // one item's delivery progress; "Yes" with a quantity means all of it was delivered
  static status(item: DeliveryItemRow, edit: StatusEdit): Row {
    const status = edit.status ?? ''
    if (!DeliveryItems.statuses.includes(status)) throw new HttpError(400, 'Invalid delivery status')
    let qty = edit.delivered_quantity === undefined ? Number(item.delivered_quantity || 0) : Number(edit.delivered_quantity || 0)
    if (status === 'Not set' || status === 'No') qty = 0
    if (!Number.isFinite(qty) || qty < 0 || (item.quantity && qty > item.quantity)) throw new HttpError(400, 'Delivered quantity must be within the required quantity')
    if (status === 'Partial' && (!item.quantity || qty <= 0 || qty >= item.quantity))
      throw new HttpError(400, 'For partial delivery, enter a required quantity and a smaller delivered quantity')
    const date = edit.delivered_date ?? item.delivered_date ?? ''
    if (date && !CalendarDate.parse(date)) throw new HttpError(400, 'Enter a valid delivered date')
    const set: Row = {
      status,
      delivered_quantity: status === 'Yes' && item.quantity ? item.quantity : qty,
      delivered_date: date || null,
      notes: edit.notes ?? item.notes ?? null,
    }
    if (edit.resolve) set.needs_review = false
    return set
  }
}
