import { useState } from 'react'
import { Booking } from '@framewise/shared/booking.ts'
import { StudioLists } from '@framewise/shared/studio-lists.ts'
import { useStudio } from '../data/studio-context.tsx'
import type { Client } from '../data/types.ts'
import { Field } from '../ui/field.tsx'
import { Format } from '../ui/format.ts'
import { useSubmit } from '../ui/use-submit.ts'
import { addDays, blankDay, DayPanel, dayInput, type DayDraft } from './day-panel.tsx'

interface PlanDraft {
  price: string
  discount: string
  booking_amount: string
  payment_date: string
  method: string
}

const COUNTS = Array.from({ length: 6 }, (_, i) => String(i + 1))

// legacy new-client flow: client, its event days, and one or more pricing groups with their booking receipts, saved together
export function NewClientForm() {
  const studio = useStudio()
  const [days, setDays] = useState<DayDraft[]>([blankDay(studio.today)])
  const [plans, setPlans] = useState<PlanDraft[]>([blankPlan(studio.today)])
  const [groupOf, setGroupOf] = useState<number[]>([0])
  const [status, setStatus] = useState('Booked')

  const resizeDays = (n: number) => {
    setDays(Array.from({ length: n }, (_, i) => days[i] ?? blankDay(addDays(studio.today, i))))
    setGroupOf(Array.from({ length: n }, (_, i) => Math.min(groupOf[i] ?? 0, plans.length - 1)))
    if (plans.length > n) setPlans(plans.slice(0, n))
  }
  const resizePlans = (n: number) => {
    setPlans(Array.from({ length: n }, (_, i) => plans[i] ?? blankPlan(studio.today)))
    setGroupOf(groupOf.map(g => Math.min(g, n - 1)))
  }
  const setPlan = (i: number, patch: Partial<PlanDraft>) => setPlans(plans.map((p, j) => (j === i ? { ...p, ...patch } : p)))
  const total = plans.reduce((n, p) => n + Number(p.price || 0) - Number(p.discount || 0), 0)
  const quoteOnly = status === 'Quote Sent'

  const { error, busy, onSubmit } = useSubmit(async fd => {
    const client = Object.fromEntries(['name', 'phone', 'bride', 'groom', 'email', 'address', 'lead_source', 'budget'].map(k => [k, fd.get(k) || null]))
    const packages = plans.map((p, i) => ({
      name: plans.length === 1 ? 'Booking' : `Pricing Group ${i + 1}`,
      price: Number(p.price || 0), discount: Number(p.discount || 0),
      day_indexes: groupOf.flatMap((g, j) => (g === i ? [j] : [])),
      booking_amount: quoteOnly ? 0 : Number(p.booking_amount || 0), payment_date: quoteOnly ? undefined : p.payment_date || undefined, method: p.method,
      deliverables: [], complimentary: [],
    }))
    let created: Client | undefined
    await studio.save(async () => {
      created = await studio.api.post<Client>('/clients', { client: { ...client, status }, days: days.map(d => dayInput(d, false)), packages })
    }, 'Client and booking created together.')
    if (created) location.hash = '#/clients/' + created.id
  })

  return (
    <form autoComplete="off" className="compact-client-form" onSubmit={onSubmit}>
      <p className="form-error" role="alert">{error}</p>
      <div className="field-grid">
        <Field name="name" label="Client / couple name" required />
        <Field name="phone" label="Phone" type="tel" />
        <Field name="status" label="Status" value={status} options={Booking.statuses.filter(s => !['Negotiation', 'Tentative', 'Lost'].includes(s)).map(s => s === 'Quote Sent' ? [s, 'Enquire'] as const : s)} onChange={setStatus} />
        <Field name="days" label="Event days" value={String(days.length)} options={COUNTS} onChange={v => resizeDays(Number(v))} />
      </div>
      <details className="compact-details">
        <summary>Names & optional details</summary>
        <div className="field-grid">
          <Field name="bride" label="Bride name" />
          <Field name="groom" label="Groom name" />
          <Field name="email" label="Email" type="email" />
          <Field name="address" label="Address" />
          <Field name="lead_source" label="Lead source" value="Instagram" options={StudioLists.leadSources} />
          <Field name="budget" label="Budget" value="Agreed" options={StudioLists.budgets} />
        </div>
      </details>

      <h3>Events</h3>
      {days.map((d, i) => <DayPanel key={i} index={i} day={d} withPrice={false} onChange={day => setDays(days.map((x, j) => (j === i ? day : x)))} />)}

      <h3>Price & payment</h3>
      <Field name="packageCount" label="Pricing groups" value={String(plans.length)} options={COUNTS.slice(0, days.length)} onChange={v => resizePlans(Number(v))} />
      <p className="subtext">Use one group for a combined price, or multiple groups for separate prices.</p>
      {plans.map((p, i) => (
        <section className="panel" key={i}>
          <h4>{plans.length > 1 ? `Pricing group ${i + 1}` : 'Booking price'}</h4>
          {plans.length > 1 && (
            <fieldset className="pricing-event-picker">
              <legend>Events in this group</legend>
              {days.map((d, j) => (
                <label key={j}><input type="radio" name={`day-group-${j}`} checked={groupOf[j] === i} onChange={() => setGroupOf(groupOf.map((g, k) => (k === j ? i : g)))} />{d.type} · Day {j + 1}</label>
              ))}
            </fieldset>
          )}
          <div className="field-grid">
            <Field name={`plan-${i}-price`} label="Package price (₹)" value={p.price} type="number" required onChange={price => setPlan(i, { price })} />
            <Field name={`plan-${i}-discount`} label="Discount (₹)" value={p.discount} type="number" required onChange={discount => setPlan(i, { discount })} />
            {!quoteOnly && <>
              <Field name={`plan-${i}-booking`} label="Booking payment received (₹)" value={p.booking_amount} type="number" onChange={booking_amount => setPlan(i, { booking_amount })} />
              <Field name={`plan-${i}-date`} label="Actual payment date" value={p.payment_date} type="date" onChange={payment_date => setPlan(i, { payment_date })} />
            </>}
          </div>
        </section>
      ))}
      <p className="final-price" aria-live="polite">Final price {Format.money(total)}</p>
      <div className="modal-footer">
        <button type="button" onClick={studio.close}>Cancel</button>
        <button type="submit" className="primary" disabled={busy}>Add client</button>
      </div>
    </form>
  )
}

function blankPlan(today: string): PlanDraft {
  return { price: '0', discount: '0', booking_amount: '0', payment_date: today, method: 'Other' }
}
