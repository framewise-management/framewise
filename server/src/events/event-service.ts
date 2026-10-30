import { CalendarDate } from '@framewise/shared/calendar-date.ts'
import { PaymentStages } from '@framewise/shared/payment-stages.ts'
import { Pricing } from '@framewise/shared/pricing.ts'
import { ProductionStages } from '@framewise/shared/production-stages.ts'
import { StudioLists } from '@framewise/shared/studio-lists.ts'
import { StudioLocale } from '@framewise/shared/studio-locale.ts'
import { ClientCompletion } from '../clients/client-completion.ts'
import type { Change, Database, Row } from '../db/database.ts'
import type { ClientRow, EventRow, EventTeamRow, PaymentRow, ProjectRow, TeamMemberRow } from '../db/rows.ts'
import { HttpError } from '../http/http-error.ts'

export interface DayInput {
  type?: string
  date?: string
  date_not_fixed?: boolean
  venue?: string
  city?: string
  services?: string | string[]
  start?: string
  end?: string
  booking_status?: string
  price?: number
  discount?: number
  booking_amount?: number
}

export interface EventWithTeam extends EventRow {
  team: string[]
  team_roles: Record<string, string>
}

export class EventService {
  static readonly editable = ['type', 'event_date', 'start_time', 'end_time', 'time_not_recorded', 'venue', 'city', 'services', 'status',
    'booking_status', 'booking_override', 'price', 'discount', 'notes', 'team'] as const

  readonly #db: Database
  readonly #today: () => string

  constructor(db: Database, today: () => string = () => StudioLocale.today()) {
    this.#db = db
    this.#today = today
  }

  async list(): Promise<EventWithTeam[]> {
    const [clients, events, team] = await Promise.all([this.#db.select<ClientRow>('clients'), this.#db.select<EventRow>('events'), this.#db.select<EventTeamRow>('event_team')])
    const deleted = new Set(clients.filter(c => c.deleted_at).map(c => c.id))
    return events
      .filter(e => !deleted.has(e.client_id))
      .map(e => ({ ...e, team: team.filter(t => t.event_id === e.id).map(t => t.member_id), team_roles: Object.fromEntries(team.filter(t => t.event_id === e.id && t.role).map(t => [t.member_id, t.role!])) }))
  }

  async setTeamRole(eventId: string, memberId: string, role: unknown): Promise<void> {
    await this.#event(eventId)
    const [member] = await this.#db.select<TeamMemberRow>('team_members', { id: memberId })
    const selected = typeof role === 'string' ? role.trim() : ''
    if (!member || !selected || !member.role?.split(',').map(r => r.trim()).includes(selected)) throw new HttpError(400, 'Select one of this team member’s roles')
    await this.#db.apply([{ op: 'update', table: 'event_team', match: { event_id: eventId, member_id: memberId }, set: { role: selected } }])
  }

  async addDays(clientId: string, days: DayInput[]): Promise<Row[]> {
    const client = await this.#client(clientId)
    const [events, projects, packages] = await Promise.all([
      this.#db.select<EventRow>('events', { client_id: clientId }),
      this.#db.select<ProjectRow>('projects'),
      this.#db.select('packages', { client_id: clientId }),
    ])
    const planned = this.dayChanges(client, packages.length > 0, days)
    const added = planned.filter(c => c.op === 'insert' && c.table === 'events').map(c => (c as { row: Row }).row as unknown as EventRow)
    const results = await this.#db.apply([...planned, ...ClientCompletion.changes(client, [...events, ...added], projects)])
    return results.slice(0, added.length).flat()
  }

  // event rows (and booking payments) for new days of one client; shared with client creation
  dayChanges(client: Pick<ClientRow, 'id' | 'finance_mode'>, hasPackages: boolean, days: DayInput[]): Change[] {
    if (hasPackages && days.some(d => Number(d.booking_amount || 0) > 0))
      throw new HttpError(400, 'Create the event, link it in Edit package, then add its payment')
    if (!Array.isArray(days) || !days.length || days.length > 31) throw new HttpError(400, 'Enter 1 to 31 days')
    for (const d of days) {
      if (!d.type?.trim() || (!d.date_not_fixed && !CalendarDate.parse(d.date)) || !d.venue?.trim() || !StudioLists.parseServices(d.services).length)
        throw new HttpError(400, 'Complete type, date (or date not fixed), location and services for every day')
      const booking = Number(d.booking_amount || 0)
      if (booking < 0 || !Number.isFinite(booking) || (client.finance_mode === 'Per day' && booking > checkedQuote(d.price || 0, d.discount || 0)))
        throw new HttpError(400, 'Booking amount must be within the day quotation')
    }
    const group = crypto.randomUUID()
    const events: Change[] = []
    const payments: Change[] = []
    for (const [i, d] of days.entries()) {
      const id = crypto.randomUUID()
      events.push({
        op: 'insert', table: 'events', row: {
          id, client_id: client.id, booking_group: group, booking_days: days.length, day_number: i + 1,
          type: d.type!.trim(), event_date: d.date_not_fixed ? null : d.date, venue: d.venue!.trim(), city: d.city || null,
          services: StudioLists.parseServices(d.services), start_time: d.start || '09:00', end_time: d.end || '18:00', status: 'Scheduled',
          booking_status: d.booking_status || null, booking_override: !!d.booking_status,
          price: Number(d.price || 0), discount: Number(d.discount || 0), quotation: checkedQuote(d.price || 0, d.discount || 0),
        },
      })
      if (Number(d.booking_amount || 0) > 0)
        payments.push({
          op: 'insert', table: 'payments', row: {
            client_id: client.id, event_id: id, stage: PaymentStages.name('Booking'), amount: Number(d.booking_amount), paid_on: this.#today(), method: 'Not set',
          },
        })
    }
    return [...events, ...payments]
  }

  async update(id: string, patch: Row): Promise<Row> {
    const event = await this.#event(id)
    const [client, packages, projects, events] = await Promise.all([
      this.#client(event.client_id),
      this.#db.select('packages', { client_id: event.client_id }),
      this.#db.select<ProjectRow>('projects'),
      this.#db.select<EventRow>('events', { client_id: event.client_id }),
    ])
    const { team, ...set } = patch
    if (packages.length && (['price', 'discount'] as const).some(k => k in set && String(set[k]) !== String(event[k])))
      throw new HttpError(400, 'Edit quotation in the package card')
    if ('price' in set || 'discount' in set) set.quotation = checkedQuote(Number(set.price ?? event.price), Number(set.discount ?? event.discount))

    const changes: Change[] = []
    if (Object.keys(set).length) changes.push({ op: 'update', table: 'events', match: { id }, set })
    if (team !== undefined) {
      const current = await this.#db.select<EventTeamRow>('event_team', { event_id: id })
      const next = new Set(memberIds(team))
      for (const member of current) if (!next.has(member.member_id)) changes.push({ op: 'delete', table: 'event_team', match: { event_id: id, member_id: member.member_id } })
      for (const member of next) if (!current.some(t => t.member_id === member)) changes.push({ op: 'insert', table: 'event_team', row: { event_id: id, member_id: member } })
    }
    const next = { ...event, ...set } as EventRow
    const newProjects = [...projects]
    if (next.status === 'Shoot Completed' && !projects.some(p => p.event_id === id)) {
      const project: ProjectRow = { id: crypto.randomUUID(), event_id: id, stage: 0, stage_names: [...ProductionStages.defaults], completed_stages: ['Shoot Completed'] }
      newProjects.push(project)
      changes.push({ op: 'insert', table: 'projects', row: { ...project } })
    }
    changes.push(...ClientCompletion.changes(client, events.map(e => e.id === id ? next : e), newProjects))
    if (!changes.length) return event as unknown as Row
    await this.#db.apply(changes)
    return (await this.#db.select('events', { id }))[0]
  }

  async remove(id: string): Promise<void> {
    const event = await this.#event(id)
    const [client, payments, events, projects] = await Promise.all([
      this.#client(event.client_id),
      this.#db.select<PaymentRow>('payments', { event_id: id }),
      this.#db.select<EventRow>('events', { client_id: event.client_id }),
      this.#db.select<ProjectRow>('projects'),
    ])
    if (payments.length || event.package_id) throw new HttpError(400, 'Event is linked to financial history')
    await this.#db.apply([
      { op: 'delete', table: 'events', match: { id } },
      ...ClientCompletion.changes(client, events.filter(e => e.id !== id), projects.filter(p => p.event_id !== id)),
    ])
  }

  async #event(id: string): Promise<EventRow> {
    const [event] = await this.#db.select<EventRow>('events', { id })
    if (!event) throw new HttpError(404, 'Event not found')
    return event
  }

  async #client(id: string): Promise<ClientRow> {
    const [client] = await this.#db.select<ClientRow>('clients', { id })
    if (!client || client.deleted_at) throw new HttpError(404, 'Select a client')
    return client
  }
}

function checkedQuote(price: number, discount: number): number {
  try {
    return Pricing.finalQuote(Number(price), Number(discount))
  } catch (e) {
    throw new HttpError(400, (e as Error).message)
  }
}

function memberIds(value: unknown): string[] {
  if (!Array.isArray(value) || value.some(v => typeof v !== 'string')) throw new HttpError(400, 'Send team as a list of member ids')
  return value
}
