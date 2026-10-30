import { useStudio } from '../data/studio-context.tsx'
import { Format } from '../ui/format.ts'

export function BookedEvents({ clientId }: { clientId: string }) {
  const { data } = useStudio()
  const events = data.bookedEvents(clientId)
  if (!events.length) return <span className="subtext">No booked events</span>
  return (
    <>
      {events.map(e => (
        <span className="booked-event-summary" key={e.id}>
          <strong>{e.type}{events.filter(x => x.type === e.type).length > 1 && e.day_number ? ' · Day ' + e.day_number : ''}</strong>
          <small>{e.event_date ? Format.date(e.event_date) : 'Date not fixed'}</small>
        </span>
      ))}
    </>
  )
}
