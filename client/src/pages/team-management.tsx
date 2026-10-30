import { useStudio } from '../data/studio-context.tsx'
import type { TeamMember } from '../data/types.ts'
import { Field } from '../ui/field.tsx'
import { Format } from '../ui/format.ts'
import { Empty } from '../ui/icon.tsx'
import { useSubmit } from '../ui/use-submit.ts'

const ROLES = ['Photographer', 'Videographer', 'Cinematographer', 'Candid', 'Editor', 'Designer', 'Assistant']

export function TeamManagement() {
  const studio = useStudio()
  const add = () => studio.open('Add team member', <TeamMemberForm />)
  return (
    <>
      <a className="back" href="#/setup">← Setup</a>
      <div className="heading workspace-heading">
        <div><span className="workspace-kicker">Setup / People</span><h1>Team Management</h1><p className="subtext">The people behind every celebration.</p></div>
        <button className="primary" onClick={add}>＋ Add team member</button>
      </div>
      <div className="workspace-list-heading"><h2>Team members</h2><span>{studio.data.team.length} {studio.data.team.length === 1 ? 'person' : 'people'}</span></div>
      {studio.data.team.length ? <div className="people-grid">{studio.data.team.map(member => (
        <article className="person-card" key={member.id}>
          <div className="person-card-head"><span className="person-avatar">{Format.initials(member.name)}</span><div><h2>{member.name}</h2><p>{member.phone || 'No contact number'}</p></div><button className="person-edit" onClick={() => studio.open('Edit team member', <TeamMemberForm member={member} />)} aria-label={`Edit ${member.name}`}>Edit</button></div>
          <div className="person-roles"><small>ROLES</small><div>{member.role ? member.role.split(',').map(role => <span key={role.trim()}>{role.trim()}</span>) : <span className="person-no-role">No roles assigned</span>}</div></div>
        </article>
      ))}</div> : <Empty title="No team members yet" text="Add your first team member to get started."><button onClick={add}>Add team member</button></Empty>}
    </>
  )
}

function TeamMemberForm({ member }: { member?: TeamMember }) {
  const studio = useStudio()
  const { error, busy, onSubmit } = useSubmit(async fd => {
    const body = { name: fd.get('name'), phone: fd.get('phone'), role: fd.getAll('role').join(', ') }
    await studio.save(() => member ? studio.api.patch(`/team/${member.id}`, body) : studio.api.post('/team', body), member ? 'Team member updated' : 'Team member added')
  })
  const selected = member?.role?.split(',').map(role => role.trim()).filter(Boolean) ?? []
  const roles = [...new Set([...ROLES, ...selected])]
  return (
    <form autoComplete="off" onSubmit={onSubmit}>
      <p className="form-error" role="alert">{error}</p>
      <div className="field-grid">
        <Field name="name" label="Name" value={member?.name} required />
        <Field name="phone" label="Contact number" value={member?.phone} type="tel" required />
        <fieldset className="service-picker wide"><legend>Roles</legend><div className="service-options">{roles.map(role => <label key={role}><input type="checkbox" name="role" value={role} defaultChecked={selected.includes(role)} />{role}</label>)}</div></fieldset>
      </div>
      <div className="modal-footer"><button type="button" onClick={studio.close}>Cancel</button><button type="submit" className="primary" disabled={busy}>{member ? 'Save changes' : 'Add team member'}</button></div>
    </form>
  )
}
