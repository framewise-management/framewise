import { useState } from 'react'
import { useStudio } from '../data/studio-context.tsx'
import type { Client } from '../data/types.ts'
import { Field } from '../ui/field.tsx'
import { useSubmit } from '../ui/use-submit.ts'
import { addDays, blankDay, DayPanel, dayInput, type DayDraft } from './day-panel.tsx'

// more event days for an existing client; once packages exist, days are priced through their package instead
export function DaysForm({ client }: { client: Client }) {
  const studio = useStudio()
  const withPrice = studio.data.packagesOf(client.id).length === 0
  const [days, setDays] = useState<DayDraft[]>([blankDay(studio.today)])
  const { error, busy, onSubmit } = useSubmit(async () => {
    await studio.save(() => studio.api.post(`/clients/${client.id}/events`, { days: days.map(d => dayInput(d, withPrice)) }), `${days.length} ${days.length === 1 ? 'event' : 'events'} added`)
  })
  return (
    <form autoComplete="off" onSubmit={onSubmit}>
      <p className="form-error" role="alert">{error}</p>
      <div className="field-grid">
        <Field name="days" label="Requirement of days" value={String(days.length)} options={Array.from({ length: 31 }, (_, i) => String(i + 1))}
          onChange={v => setDays(Array.from({ length: Number(v) }, (_, i) => days[i] ?? blankDay(addDays(studio.today, i))))} />
      </div>
      <p className="subtext">One linked event per day. Events start with 9 am–6 pm; edit time and assign crew after saving.{withPrice ? '' : ' Link new days to a pricing group under Payments.'}</p>
      {days.map((d, i) => <DayPanel key={i} index={i} day={d} withPrice={withPrice} onChange={day => setDays(days.map((x, j) => (j === i ? day : x)))} />)}
      <div className="modal-footer">
        <button type="button" onClick={studio.close}>Cancel</button>
        <button type="submit" className="primary" disabled={busy}>Create {days.length} {days.length === 1 ? 'event' : 'events'}</button>
      </div>
    </form>
  )
}
