import { Booking } from '@framewise/shared/booking.ts'
import { useStudio } from '../data/studio-context.tsx'
import { Empty, Tag } from '../ui/icon.tsx'
import { BookedEvents } from './booked-events.tsx'
import { Format } from '../ui/format.ts'

export function ProjectsPage() {
  const { data } = useStudio()
  const clients = data.clients.filter(client => Booking.won.includes(client.status))
  return (
    <>
      <div className="heading workspace-heading"><div><span className="workspace-kicker">Your work</span><h1>Projects</h1><p className="subtext">Every booked celebration, in one place.</p></div></div>
      <div className="workspace-list-heading"><h2>Booked projects</h2><span>{clients.length} {clients.length === 1 ? 'project' : 'projects'}</span></div>
      {clients.length ? <div className="client-list">{clients.map(client => (
        <a className="client-card" key={client.id} href={'#/clients/' + client.id}>
          <div className="client-card-head"><span className="initials">{Format.initials(client.name)}</span><span><small>{client.code}</small><h2>{client.name}</h2></span><Tag value={client.status} /></div>
          <div className="client-meta"><span><small>Booked events</small><span className="booked-event-list"><BookedEvents clientId={client.id} /></span></span></div>
        </a>
      ))}</div> : <Empty title="No booked projects yet" text="Booked clients will appear here." />}
    </>
  )
}
