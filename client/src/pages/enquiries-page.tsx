import { useState } from 'react'
import { Booking } from '@framewise/shared/booking.ts'
import { useStudio } from '../data/studio-context.tsx'
import type { Client, Enquiry } from '../data/types.ts'
import { EnquiryForm } from '../forms/enquiry-form.tsx'
import { Format } from '../ui/format.ts'
import { Empty, Tag } from '../ui/icon.tsx'

export function EnquiriesPage() {
  const studio = useStudio()
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('All')
  const isClosed = (q: Enquiry) => !!q.client_id || ['Booked', 'Confirmed', 'Canceled', 'Lost'].includes(q.status)
  const rows = studio.data.enquiries.filter(q => (filter === 'All' || (filter === 'Closed' ? isClosed(q) : !isClosed(q))) && JSON.stringify(q).toLowerCase().includes(search.toLowerCase()))
  return (
    <>
      <div className="heading">
        <div><h1>Enquiries</h1><p className="subtext">Follow up thoughtfully. Turn conversations into celebrations.</p></div>
        <button className="primary" onClick={() => studio.open('New enquiry', <EnquiryForm />)}>＋ New enquiry</button>
      </div>
      <div className="toolbar">
        <input autoComplete="off" aria-label="Search enquiries" placeholder="Search enquiries" value={search} onChange={e => setSearch(e.target.value)} />
        <div className="tabs" aria-label="Enquiry filters">{['All', 'Recent', 'Closed'].map(s => <button key={s} className={filter === s ? 'active' : ''} aria-pressed={filter === s} onClick={() => setFilter(s)}>{s}</button>)}</div>
      </div>
      <div className="cards">
        {rows.map(q => <EnquiryCard key={q.id} enquiry={q} />)}
        {!rows.length && <Empty title="No enquiries here" text={search ? "Try a different search." : filter === "Recent" ? "Open enquiries will appear here." : filter === "Closed" ? "Closed enquiries will appear here." : "Add an enquiry to begin the workflow."} />}
      </div>
    </>
  )
}

function EnquiryCard({ enquiry: q }: { enquiry: Enquiry }) {
  const studio = useStudio()
  const fail = (e: Error) => studio.toast(e.message)
  const setStatus = (status: string) => studio.save(() => studio.api.patch(`/enquiries/${q.id}`, { status }), 'Status updated', true).catch(fail)
  const convert = async () => {
    let client: Client | undefined
    await studio.save(async () => { client = await studio.api.post<Client>(`/enquiries/${q.id}/convert`) }, 'Client created from enquiry').catch(fail)
    if (client) location.hash = '#/clients/' + client.id
  }
  const remove = () => studio.open('Delete enquiry?', (
    <>
      <p>{q.name} will be removed.</p>
      <div className="modal-footer"><button onClick={studio.close}>Cancel</button><button className="danger" onClick={() => studio.save(() => studio.api.delete(`/enquiries/${q.id}`), 'Enquiry deleted').catch(fail)}>Delete</button></div>
    </>
  ))
  return (
    <article className="card">
      <div className="card-top"><div className="initials">{Format.initials(q.name)}</div><Tag value={q.status} /></div>
      <h2>{q.name}</h2>
      <p>{Format.date(q.wedding_date)} · {q.city}<br />{q.phone}</p>
      <p>{q.notes}</p>
      <p className="subtext">{q.lead_source || 'Source not recorded'} · Budget {q.budget || 'not recorded'}</p>
      <div className="line-items"><span>{q.package_name}</span><strong>{Format.money(q.price - q.discount)}</strong></div>
      <div className="field" style={{ marginTop: 16 }}>
        <label>Status</label>
        <select value={q.status} disabled={!!q.client_id} onChange={e => setStatus(e.target.value)}>{Booking.enquiryStatuses.map(s => <option key={s}>{s}</option>)}</select>
      </div>
      <p>Follow-up · {Format.date(q.followup)}</p>
      <div className="actions">
        <button className="small" onClick={() => studio.open('Edit enquiry', <EnquiryForm enquiry={q} />)}>Edit details</button>
        {q.client_id
          ? <a className="linked" href={'#/clients/' + q.client_id}>Open client</a>
          : (q.status === 'Confirmed' || q.status === 'Booked') && <button className="primary small" onClick={convert}>Create client</button>}
        <button className="danger small" onClick={remove}>Delete</button>
      </div>
    </article>
  )
}
