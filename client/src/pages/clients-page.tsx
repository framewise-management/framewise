import { useState } from 'react'
import { useStudio } from '../data/studio-context.tsx'
import type { Client } from '../data/types.ts'
import { NewClientForm } from '../forms/new-client-form.tsx'
import { Format } from '../ui/format.ts'
import { Empty, Icon, Tag } from '../ui/icon.tsx'
import { BookedEvents } from './booked-events.tsx'

export function ClientsPage() {
  const studio = useStudio()
  const { data } = studio
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('All')
  const q = search.trim().toLowerCase()
  const rows = data.clients.filter(c => (filter === 'All' || c.status === filter || (filter === 'Booked' && c.status === 'Confirmed')) && (!q || [c.name, c.phone, c.code].some(v => (v || '').toLowerCase().includes(q))))
  const add = () => studio.open('New client', <NewClientForm />)
  return (
    <>
      <div className="heading workspace-heading">
        <div><span className="workspace-kicker">Your relationships</span><h1>Clients</h1><p className="subtext">{rows.length} {rows.length === 1 ? 'client' : 'clients'} in view</p></div>
        <div className="actions"><button className="primary" onClick={add}>＋ New client</button></div>
      </div>
      <div className="toolbar client-search-toolbar">
        <div className="client-search-wrap">
          <input autoComplete="off" aria-label="Search clients" placeholder="Search name, phone or client ID" value={search} onChange={e => setSearch(e.target.value)} />
          {search && <button type="button" aria-label="Clear Search" onClick={() => setSearch('')}>×</button>}
        </div>
        <div className="tabs">
          {['All', 'Quote Sent', 'Booked', 'Canceled', 'Completed'].map(s => <button key={s} className={filter === s ? 'active' : ''} aria-pressed={filter === s} onClick={() => setFilter(s)}>{s === 'Quote Sent' ? 'Enquire' : s}</button>)}
        </div>
      </div>
      <div className="client-list">
        {rows.map(c => <ClientCard key={c.id} client={c} />)}
        {!rows.length && <Empty title="No clients found" text="Try a different search or add your first client."><button className="primary" onClick={add}>New client</button></Empty>}
      </div>
    </>
  )
}

function ClientCard({ client: c }: { client: Client }) {
  const { data, today } = useStudio()
  const next = data.nextEvent(c.id, today)
  const balance = data.balance(c.id)
  return (
    <article className="client-sort-card">
      <a className="client-card" href={'#/clients/' + c.id}>
        <div className="client-card-head">
          <span className="initials">{Format.initials(c.name)}</span>
          <span><small>{c.code}</small><h2>{c.name}</h2></span>
          <Tag value={c.status} />
        </div>
        <div className="client-meta">
          <span><small>Booked events</small><span className="booked-event-list"><BookedEvents clientId={c.id} /></span></span>
          <span><small>Pending balance</small><strong className={'money' + (balance > 0 ? ' balance' : '')}>{Format.money(balance)}</strong></span>
        </div>
        <div className="next-event">
          <span><Icon name="calendar" /></span>
          <span>
            {next
              ? <>{next.type} · {next.event_date ? Format.date(next.event_date) : 'Date not fixed'}<small>{next.time_not_recorded ? 'Time not recorded' : Format.time(next.start_time)}{next.city ? ' · ' + next.city : ''}</small></>
              : 'No upcoming event'}
          </span>
        </div>
      </a>
    </article>
  )
}
