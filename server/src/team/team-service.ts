import type { Change, Database, Row } from '../db/database.ts'
import type { AssignmentRow, ClientRow, EventRow, EventTeamRow, TeamMemberRow } from '../db/rows.ts'
import { HttpError } from '../http/http-error.ts'

// team members and their paid assignments to event services; an assigned member is also on the event's crew
export class TeamService {
  static readonly memberFields = ['name', 'role', 'phone'] as const
  static readonly assignmentFields = ['event_id', 'member_id', 'service', 'charge', 'paid', 'method'] as const

  readonly #db: Database

  constructor(db: Database) {
    this.#db = db
  }

  members(): Promise<TeamMemberRow[]> {
    return this.#db.select<TeamMemberRow>('team_members')
  }

  async addMember(row: Row): Promise<Row> {
    const name = checkedName(row.name)
    const [[created]] = await this.#db.apply([{ op: 'insert', table: 'team_members', row: { ...row, name } }])
    return created
  }

  async updateMember(id: string, patch: Row): Promise<Row> {
    const set = 'name' in patch ? { ...patch, name: checkedName(patch.name) } : patch
    const [[updated]] = await this.#db.apply([{ op: 'update', table: 'team_members', match: { id }, set }])
    return updated
  }

  // only members without money on their assignments can go; their unpaid assignments go with them
  async removeMember(id: string): Promise<void> {
    const assignments = await this.#db.select<AssignmentRow>('assignments', { member_id: id })
    if (assignments.some(a => a.charge > 0 || a.paid > 0)) throw new HttpError(400, 'Reassign financial assignments before removing this team member')
    await this.#db.apply([
      { op: 'delete', table: 'assignments', match: { member_id: id }, optional: true },
      { op: 'delete', table: 'team_members', match: { id } },
    ])
  }

  async assignments(): Promise<AssignmentRow[]> {
    const [clients, events, assignments] = await Promise.all([this.#db.select<ClientRow>('clients'), this.#db.select<EventRow>('events'), this.#db.select<AssignmentRow>('assignments')])
    const deleted = new Set(clients.filter(c => c.deleted_at).map(c => c.id))
    const hidden = new Set(events.filter(e => deleted.has(e.client_id)).map(e => e.id))
    return assignments.filter(a => !hidden.has(a.event_id))
  }

  async assign(input: Row): Promise<Row> {
    const row = await this.#checked(input, null)
    const crew = await this.#db.select<EventTeamRow>('event_team', { event_id: row.event_id as string })
    const [[created]] = await this.#db.apply([
      { op: 'insert', table: 'assignments', row },
      ...(crew.some(t => t.member_id === row.member_id) ? [] : [{ op: 'insert', table: 'event_team', row: { event_id: row.event_id, member_id: row.member_id } } as Change]),
    ])
    return created
  }

  async updateAssignment(id: string, patch: Row): Promise<Row> {
    const [old] = await this.#db.select<AssignmentRow>('assignments', { id })
    if (!old) throw new HttpError(404, 'Assignment not found')
    if ('event_id' in patch && patch.event_id !== old.event_id) throw new HttpError(400, 'Edit the assignment on its original event')
    const row = await this.#checked({ ...old, ...patch }, id)
    const [crew, others] = await Promise.all([
      this.#db.select<EventTeamRow>('event_team', { event_id: old.event_id }),
      this.#db.select<AssignmentRow>('assignments', { event_id: old.event_id }),
    ])
    const changes: Change[] = [{ op: 'update', table: 'assignments', match: { id }, set: Object.fromEntries(Object.keys(patch).map(k => [k, row[k]])) }]
    if (!crew.some(t => t.member_id === row.member_id)) changes.push({ op: 'insert', table: 'event_team', row: { event_id: old.event_id, member_id: row.member_id } })
    if (row.member_id !== old.member_id && !others.some(a => a.id !== id && a.member_id === old.member_id))
      changes.push({ op: 'delete', table: 'event_team', match: { event_id: old.event_id, member_id: old.member_id }, optional: true })
    const [[updated]] = await this.#db.apply(changes)
    return updated
  }

  async unassign(id: string): Promise<void> {
    const [old] = await this.#db.select<AssignmentRow>('assignments', { id })
    if (!old) throw new HttpError(404, 'Assignment not found')
    const others = (await this.#db.select<AssignmentRow>('assignments', { event_id: old.event_id })).filter(a => a.id !== id)
    await this.#db.apply([
      { op: 'delete', table: 'assignments', match: { id } },
      ...(others.some(a => a.member_id === old.member_id) ? [] : [{ op: 'delete', table: 'event_team', match: { event_id: old.event_id, member_id: old.member_id }, optional: true } as Change]),
    ])
  }

  // legacy Store.assignment: one member per service per event, a person only once per event, paid within the charge
  async #checked(v: Row, id: string | null): Promise<Row> {
    const [[event], team] = await Promise.all([
      v.event_id ? this.#db.select<EventRow>('events', { id: v.event_id as string }) : Promise.resolve([] as EventRow[]),
      this.#db.select<TeamMemberRow>('team_members'),
    ])
    const member = team.find(t => t.id === v.member_id)
    const service = String(v.service || '').trim()
    if (!event || !member || !service) throw new HttpError(400, 'Select an event, service and team member')
    const others = (await this.#db.select<AssignmentRow>('assignments', { event_id: event.id })).filter(a => a.id !== id)
    if (others.some(a => a.service.trim().toLowerCase() === service.toLowerCase()))
      throw new HttpError(400, 'This service already has a team member. Edit the existing assignment instead.')
    if (others.some(a => samePerson(team.find(t => t.id === a.member_id), member)))
      throw new HttpError(400, 'This team member is already assigned to this event. Select another member.')
    const charge = Number(v.charge)
    const paid = Number(v.paid)
    if (!Number.isFinite(charge) || !Number.isFinite(paid) || charge < 0 || paid < 0 || paid > charge)
      throw new HttpError(400, 'Team payment must be between zero and the agreed charge')
    return { ...v, service, charge, paid }
  }
}

function checkedName(value: unknown): string {
  const name = String(value || '').trim()
  if (!name) throw new HttpError(400, 'Enter the team member name')
  return name
}

// the same person may exist twice in the team list; match on the last 10 phone digits or the name
function samePerson(a: TeamMemberRow | undefined, b: TeamMemberRow): boolean {
  if (!a) return false
  const digits = (p: string | null) => (p || '').replace(/\D/g, '').slice(-10)
  return a.id === b.id || (!!a.phone && !!b.phone && digits(a.phone) === digits(b.phone)) || a.name.trim().toLowerCase() === b.name.trim().toLowerCase()
}
