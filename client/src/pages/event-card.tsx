import { useStudio } from '../data/studio-context.tsx'
import type { StudioEvent } from '../data/types.ts'
import { EventForm } from '../forms/event-form.tsx'
import { Format } from '../ui/format.ts'
import { Tag } from '../ui/icon.tsx'

export function EventCard({ event: e }: { event: StudioEvent }) {
  const studio = useStudio()
  const { data } = studio
  const open = () => studio.open(e.type, <EventForm event={e} />)
  return (
    <div className="event-card" role="button" tabIndex={0} onClick={open} onKeyDown={k => k.key === 'Enter' && open()}>
      <div className="date-tile">
        <strong>{e.event_date ? e.event_date.slice(8) : '—'}</strong>
        <span>{e.event_date ? new Date(e.event_date + 'T12:00').toLocaleDateString('en', { month: 'short' }) : 'TBC'}</span>
      </div>
      <div>
        <h3>{data.client(e.client_id)?.name} <span className="subtext">{e.type}</span></h3>
        <p>{e.venue}{e.city ? ' · ' + e.city : ''}</p>
        <p>{e.time_not_recorded ? 'Time not recorded' : `${Format.time(e.start_time)} – ${Format.time(e.end_time)}`} · {e.team.length ? e.team.map(t => data.memberName(t).split(' ')[0]).join(', ') : 'Team unassigned'}</p>
      </div>
      <div className="event-side">
        <Tag value={e.status === 'Shoot Completed' ? 'Completed' : data.booking(e)} />
        {!e.event_date && <Tag value="Date Not Fixed" />}
      </div>
    </div>
  )
}
