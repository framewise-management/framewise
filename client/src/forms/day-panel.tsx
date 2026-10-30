import { StudioLists } from '@framewise/shared/studio-lists.ts'
import { Field } from '../ui/field.tsx'
import { Format } from '../ui/format.ts'
import { ServicePicker } from './service-picker.tsx'

export interface DayDraft {
  type: string
  date: string
  date_not_fixed: boolean
  venue: string
  services: string[]
  price: string
  discount: string
  booking_amount: string
}

export function blankDay(date: string): DayDraft {
  return { type: 'Pre-Wedding', date, date_not_fixed: false, venue: '', services: [], price: '0', discount: '0', booking_amount: '0' }
}

// one event day of a multi-day booking; prices only when the day is priced on its own
export function DayPanel({ index, day, withPrice, onChange }: { index: number; day: DayDraft; withPrice: boolean; onChange: (day: DayDraft) => void }) {
  const set = (patch: Partial<DayDraft>) => onChange({ ...day, ...patch })
  const quote = Number(day.price || 0) - Number(day.discount || 0)
  return (
    <section className="panel event-day-panel">
      <h3>Day {index + 1} · {day.type}</h3>
      <div className="field-grid">
        <Field name={`day-${index}-type`} label="Event type" value={day.type} options={StudioLists.eventTypes} onChange={type => set({ type })} />
        <Field name={`day-${index}-date`} label="Event date" value={day.date} type="date" required={!day.date_not_fixed} disabled={day.date_not_fixed} onChange={date => set({ date })} />
        <Field name={`day-${index}-venue`} label="Event location" value={day.venue} required onChange={venue => set({ venue })} />
        {withPrice && <>
          <Field name={`day-${index}-price`} label="Day booking amount (₹)" value={day.price} type="number" onChange={price => set({ price })} />
          <Field name={`day-${index}-discount`} label="Day discount (₹)" value={day.discount} type="number" onChange={discount => set({ discount })} />
          <Field name={`day-${index}-booking`} label="Booking amount received (₹)" value={day.booking_amount} type="number" onChange={booking_amount => set({ booking_amount })} />
        </>}
        <label className="check-line wide">
          <input type="checkbox" checked={day.date_not_fixed} onChange={e => set({ date_not_fixed: e.target.checked })} />Date not fixed yet
        </label>
        <ServicePicker name={`day-${index}-services`} selected={day.services} onChange={services => set({ services })} />
        {withPrice && <p className="wide subtext">{quote < 0 ? 'Discount must be between zero and package price' : 'Final quotation ' + Format.money(quote)}</p>}
      </div>
    </section>
  )
}

// the API's day shape
export function dayInput(d: DayDraft, withPrice: boolean) {
  return {
    type: d.type, date: d.date_not_fixed ? undefined : d.date, date_not_fixed: d.date_not_fixed, venue: d.venue, services: d.services,
    ...(withPrice ? { price: Number(d.price || 0), discount: Number(d.discount || 0), booking_amount: Number(d.booking_amount || 0) } : {}),
  }
}

export function addDays(iso: string, n: number): string {
  const d = new Date(iso + 'T12:00:00')
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}
