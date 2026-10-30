import { Booking } from '@framewise/shared/booking.ts'
import { StudioLists } from '@framewise/shared/studio-lists.ts'
import { useStudio } from '../data/studio-context.tsx'
import type { StudioEvent } from '../data/types.ts'
import { Field } from '../ui/field.tsx'
import { Format } from '../ui/format.ts'
import { useSubmit } from '../ui/use-submit.ts'
import { ServicePicker } from './service-picker.tsx'

export function EventForm({ event }: { event: StudioEvent }) {
  const studio = useStudio()
  const client = studio.data.client(event.client_id)
  const hasPackages = studio.data.packagesOf(event.client_id).length > 0
  const { error, busy, onSubmit } = useSubmit(async fd => {
    const date = fd.get('event_date') as string
    const body: Record<string, unknown> = {
      type: fd.get('type'), event_date: date || null, start_time: fd.get('start_time') || null, end_time: fd.get('end_time') || null,
      time_not_recorded: !fd.get('start_time') || !fd.get('end_time'), venue: fd.get('venue'), city: fd.get('city') || null,
      services: fd.getAll('services'), booking_status: fd.get('booking_status'), status: fd.get('status'), notes: fd.get('notes') || null,
    }
    if (body.booking_status !== event.booking_status) body.booking_override = true
    if (!hasPackages) Object.assign(body, { price: Number(fd.get('price') || 0), discount: Number(fd.get('discount') || 0) })
    await studio.save(() => studio.api.patch(`/events/${event.id}`, body), 'Event saved')
  })
  const remove = async () => {
    try {
      await studio.save(() => studio.api.delete(`/events/${event.id}`), 'Event deleted')
    } catch (e) {
      studio.toast((e as Error).message)
    }
  }
  return (
    <form autoComplete="off" onSubmit={onSubmit}>
      <p className="form-error" role="alert">{error}</p>
      <p className="subtext">{client?.name}</p>
      <div className="field-grid">
        <Field name="type" label="Event type" value={event.type} options={[...new Set([...StudioLists.eventTypes, event.type])]} />
        <Field name="event_date" label="Event date" value={event.event_date} type="date" />
        <p className="wide subtext">Leave date blank if it is not fixed yet. Leave times blank if not recorded.</p>
        <Field name="start_time" label="Start time" value={Format.time(event.start_time)} type="time" />
        <Field name="end_time" label="End time" value={Format.time(event.end_time)} type="time" />
        <Field name="venue" label="Event location" value={event.venue} required />
        <Field name="city" label="City" value={event.city} />
        <ServicePicker name="services" selected={event.services} />
        <Field name="booking_status" label="Booking status" value={event.booking_status || client?.status || 'Booked'} options={Booking.clientStatuses} />
        <Field name="status" label="Shoot status" value={event.status} options={['Not recorded', 'Scheduled', 'Shoot Completed']} />
        {!hasPackages && <>
          <Field name="price" label="Day booking amount (₹)" value={event.price} type="number" />
          <Field name="discount" label="Day discount (₹)" value={event.discount} type="number" />
        </>}
        <Field name="notes" label="Event notes" value={event.notes} type="textarea" />
      </div>
      <div className="modal-footer">
        <button type="button" className="danger" onClick={remove}>Delete event</button>
        <button type="button" onClick={studio.close}>Cancel</button>
        <button type="submit" className="primary" disabled={busy}>Save changes</button>
      </div>
    </form>
  )
}
