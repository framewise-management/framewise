import { useStudio } from '../data/studio-context.tsx'
import type { StudioEvent } from '../data/types.ts'
import { Empty } from '../ui/icon.tsx'
import { Format } from '../ui/format.ts'
import { useSubmit } from '../ui/use-submit.ts'

export function ClientTeam({ clientId }: { clientId: string }) {
  const studio = useStudio()
  const events = studio.data.eventsOf(clientId)
  if (!events.length) return <Empty title="No events yet" text="Add an event before assigning team members." />
  return <><div className="section-header"><h2>Team</h2></div>{events.map(event => (
    <section className="panel" key={event.id}>
      <div className="section-header"><div><h3>{event.type}</h3><p className="subtext">{event.event_date ? Format.date(event.event_date) : 'Date not fixed'}</p></div><button className="small" onClick={() => studio.open('Add team members', <AddEventTeam event={event} />)}>＋ Add team</button></div>
      {event.team.length ? event.team.map(id => {
        const member = studio.data.team.find(m => m.id === id)
        const current = event.team_roles?.[id] ?? ''
        const roles = [...new Set([...(member?.role?.split(',').map(r => r.trim()).filter(Boolean) ?? []), ...(current ? [current] : [])])]
        return <div className="crew-row" key={id}><strong>{studio.data.memberName(id)}</strong>{roles.length ? <label>Event role <select value={current} onChange={e => {
          const role = e.target.value
          if (role) studio.save(() => studio.api.patch(`/events/${event.id}/team/${id}`, { role }), 'Event role saved', true).catch(err => studio.toast((err as Error).message))
        }}><option value="" disabled>Select role</option>{roles.map(role => <option key={role} value={role}>{role}</option>)}</select></label> : <span className="subtext">Add roles in Team Management first.</span>}</div>
      }) : <p className="subtext">No team members assigned.</p>}
    </section>
  ))}</>
}

function AddEventTeam({ event }: { event: StudioEvent }) {
  const studio = useStudio()
  const available = studio.data.team.filter(member => !event.team.includes(member.id))
  const { error, busy, onSubmit } = useSubmit(async fd => {
    const selected = fd.getAll('member').map(String)
    if (!selected.length) throw new Error('Select at least one team member')
    await studio.save(() => studio.api.patch(`/events/${event.id}`, { team: [...event.team, ...selected] }), 'Team updated')
  })
  return <form autoComplete="off" onSubmit={onSubmit}>
    <p className="form-error" role="alert">{error}</p>
    <p className="subtext">{event.type} · {event.event_date ? Format.date(event.event_date) : 'Date not fixed'}</p>
    {available.length ? <fieldset className="service-picker"><legend>Team members</legend><div className="check-list">{available.map(member => <label key={member.id}><input type="checkbox" name="member" value={member.id} /><span>{member.name}{member.role ? ` · ${member.role}` : ''}</span></label>)}</div></fieldset> : <p className="subtext">No more team members available. Add members under Setup → Team Management.</p>}
    <div className="modal-footer"><button type="button" onClick={studio.close}>Cancel</button>{available.length > 0 && <button type="submit" className="primary" disabled={busy}>Add selected</button>}</div>
  </form>
}
