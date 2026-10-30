import { useState } from 'react'
import { Booking } from '@framewise/shared/booking.ts'
import { StudioLists } from '@framewise/shared/studio-lists.ts'
import { useStudio } from '../data/studio-context.tsx'
import type { Client, Payment } from '../data/types.ts'
import { ClientForm } from '../forms/client-form.tsx'
import { DaysForm } from '../forms/days-form.tsx'
import { PackageForm } from '../forms/package-form.tsx'
import { PaymentForm } from '../forms/payment-form.tsx'
import { StagePlanForm } from '../forms/stage-plan-form.tsx'
import { Field } from '../ui/field.tsx'
import { Format } from '../ui/format.ts'
import { Empty, Icon, Tag } from '../ui/icon.tsx'
import { BookedEvents } from './booked-events.tsx'
import { EventCard } from './event-card.tsx'
import { ClientTeam } from './client-team.tsx'

const TABS = ['Overview', 'Events', 'Payments', 'Team', 'Delivery', 'Project', 'Notes'] as const

export function ClientDetail({ id }: { id: string }) {
  const studio = useStudio()
  const [tab, setTab] = useState<(typeof TABS)[number]>('Overview')
  const c = studio.data.client(id)
  if (!c) return <Empty title="Client not found" text="This client may have been deleted."><a href="#/clients" className="linked">All clients</a></Empty>
  const phone = Format.phone(c.phone)
  return (
    <>
      <a className="back" href="#/clients">‹ Clients</a>
      <div className="profile-heading">
        <span className="initials">{Format.initials(c.name)}</span>
        <div><small>{c.code}</small><h1>{c.name}</h1><div className="booked-event-list profile-booked-events"><BookedEvents clientId={id} /></div></div>
        <Tag value={c.status} />
      </div>
      <div className="profile-actions">
        <button onClick={() => studio.open('Edit client', <ClientForm client={c} />)}>Edit Client</button>
        {phone
          ? <><a href={'tel:+' + phone}><Icon name="call" /><span>Call</span></a><a href={'https://wa.me/' + phone} target="_blank" rel="noopener"><Icon name="chat" /><span>WhatsApp</span></a></>
          : <button onClick={() => studio.toast('Add a phone number in client details first')}><Icon name="call" /><span>Call</span></button>}
        <button onClick={() => studio.open('Plan event days', <DaysForm client={c} />)}><Icon name="calendar" /><span>Add Event</span></button>
        <button onClick={() => studio.open('New payment', <PaymentForm clientId={id} />)}><Icon name="finance" /><span>Add Payment</span></button>
        <button onClick={() => setTab('Notes')}><Icon name="note" /><span>Add Note</span></button>
      </div>
      <div className="tabs">
        {TABS.map(t => <button key={t} className={tab === t ? 'active' : ''} aria-pressed={tab === t} onClick={() => setTab(t)}>{t}</button>)}
      </div>
      <div className="profile-tab-body">
        {tab === 'Overview' && <Overview client={c} />}
        {tab === 'Events' && <Events client={c} />}
        {tab === 'Payments' && <Payments client={c} />}
        {tab === 'Team' && <ClientTeam clientId={c.id} />}
        {tab === 'Notes' && <Notes client={c} />}
        {(tab === 'Delivery' || tab === 'Project') && <Empty title={tab + ' arrives in the next update'} text="Delivery tracking and production projects are part of the next UI slice." />}
      </div>
    </>
  )
}

function useFieldSaver(client: Client) {
  const studio = useStudio()
  return (name: keyof Client, number = false) => (value: string) =>
    studio.save(() => studio.api.patch(`/clients/${client.id}`, { [name]: number ? Number(value || 0) : value || null }), 'Saved', true)
      .catch(e => studio.toast((e as Error).message))
}

function Overview({ client: c }: { client: Client }) {
  const studio = useStudio()
  const { data } = studio
  const save = useFieldSaver(c)
  const hasPackages = data.packagesOf(c.id).length > 0
  const remove = () => studio.open('Delete client?', (
    <>
      <p>{c.name} and everything linked to them disappears from the studio. It can be restored later.</p>
      <div className="modal-footer">
        <button onClick={studio.close}>Cancel</button>
        <button className="danger" onClick={() => studio.save(() => studio.api.delete(`/clients/${c.id}`), 'Client deleted').then(() => { location.hash = '#/clients' }).catch(e => studio.toast(e.message))}>Delete client</button>
      </div>
    </>
  ))
  return (
    <>
      <section className="panel">
        <h2>Booking at a glance</h2>
        <div className="profile-money">
          <div><small>Booking amount</small><strong>{Format.money(data.quote(c.id))}</strong></div>
          <div><small>Received</small><strong>{Format.money(data.paid(c.id))}</strong></div>
          <div><small>Pending</small><strong>{Format.money(data.balance(c.id))}</strong></div>
        </div>
        <div className="line-items"><span>{c.package_name || 'Booking'}</span><span>Due {Format.date(c.due)}</span></div>
      </section>
      <section className="panel inline">
        <h2>Client details</h2>
        <p className="inline-hint">Edit here. Changes save when you leave a field.</p>
        <div className="field-grid">
          <Field name="phone" label="Phone" value={c.phone} type="tel" onSave={save('phone')} />
          <Field name="email" label="Email" value={c.email} type="email" onSave={save('email')} />
          <Field name="address" label="Address" value={c.address} onSave={save('address')} />
          <Field name="bride" label="Bride name" value={c.bride} onSave={save('bride')} />
          <Field name="groom" label="Groom name" value={c.groom} onSave={save('groom')} />
          <Field name="lead_source" label="Lead source" value={c.lead_source || 'Others'} options={StudioLists.leadSources} onSave={save('lead_source')} />
          <Field name="budget" label="Budget" value={c.budget || 'Agreed'} options={StudioLists.budgets} onSave={save('budget')} />
        </div>
        <details className="edit-details">
          <summary>Edit booking details</summary>
          <div className="field-grid">
            <Field name="name" label="Couple / client name" value={c.name} onSave={save('name')} />
            <Field name="status" label="Booking status" value={c.status} options={Booking.clientStatuses} onSave={save('status')} />
            <Field name="wedding_date" label="Wedding date" value={c.wedding_date} type="date" onSave={save('wedding_date')} />
            <Field name="due" label="Next payment due" value={c.due} type="date" onSave={save('due')} />
            {!hasPackages && <>
              <Field name="price" label="Booking amount" value={c.price} type="number" onSave={save('price', true)} />
              <Field name="discount" label="Discount" value={c.discount} type="number" onSave={save('discount', true)} />
            </>}
          </div>
        </details>
      </section>
      <div className="profile-delete"><button className="danger" onClick={remove}>Delete client</button></div>
    </>
  )
}

function Events({ client: c }: { client: Client }) {
  const studio = useStudio()
  const events = studio.data.eventsOf(c.id)
  const add = () => studio.open('Plan event days', <DaysForm client={c} />)
  return (
    <>
      <div className="section-header"><h2>Celebrations <span className="count">{events.length}</span></h2><button className="small" onClick={add}>＋ Add</button></div>
      {events.map(e => <EventCard key={e.id} event={e} />)}
      {!events.length && <Empty title="No events yet" text="Plan a celebration for this client."><button className="primary" onClick={add}>Add event</button></Empty>}
    </>
  )
}

function Payments({ client: c }: { client: Client }) {
  const studio = useStudio()
  const { data } = studio
  const record = (stage?: string) => studio.open('New payment', <PaymentForm clientId={c.id} stage={stage} />)
  return (
    <div className="client-payment-dashboard">
      <section className="payment-overview">
        <div className="section-header">
          <div><h2>Payments</h2><p className="subtext">Every receipt, from booking to delivery</p></div>
          <div className="actions"><button className="primary small" onClick={() => record()}>＋ Add payment</button></div>
        </div>
        <div className="payment-totals">
          <div><small>Total amount</small><strong>{Format.money(data.quote(c.id))}</strong></div>
          <div><small>Received</small><strong>{Format.money(data.paid(c.id))}</strong></div>
          <div><small>Outstanding</small><strong>{Format.money(data.balance(c.id))}</strong></div>
        </div>
      </section>
      <section className="payment-stages">
        <div className="section-header">
          <h3>Payment stages</h3>
          <button type="button" className="small" onClick={() => studio.open('Payment stage amounts', <StagePlanForm clientId={c.id} />)}>Set stage amounts</button>
        </div>
        <p className="subtext">Stage status uses your expected amount. Setting targets does not change the quotation.</p>
        {data.stages(c.id).map(stage => (
          <details className="payment-stage-card" key={stage.name} open={stage.rows.length > 0}>
            <summary>
              <span><strong>{stage.name}</strong><small>{stage.rows.length} {stage.rows.length === 1 ? 'payment' : 'payments'} · Received {Format.money(stage.received)}{stage.target === undefined ? '' : ' / ' + Format.money(stage.target)}</small></span>
              <span className={'tag' + (stage.status === 'Paid' ? ' paid' : '')}>{stage.status}</span>
            </summary>
            <div className="payment-stage-body">
              {stage.pending === null ? <p className="subtext">Expected amount not set.</p> : <p className="subtext">Expected {Format.money(stage.target!)} · Pending {Format.money(stage.pending)}</p>}
              {stage.rows.map(p => <PaymentRow key={p.id} payment={p} />)}
              {!stage.rows.length && <p className="subtext">No payment recorded for this stage.</p>}
              <button type="button" className="small" onClick={() => record(stage.name)}>＋ Record payment</button>
            </div>
          </details>
        ))}
      </section>
      <details className="payment-booking-details" open={!data.packagesOf(c.id).length}>
        <summary>Pricing groups</summary>
        <PricingGroups client={c} />
      </details>
    </div>
  )
}

function PaymentRow({ payment: p }: { payment: Payment }) {
  const studio = useStudio()
  return (
    <article className="stage-payment-row">
      <div className="payment-card-head">
        <div><strong>{Format.money(p.amount)}</strong><small>{p.paid_on ? Format.date(p.paid_on) : 'Date unknown'} · {p.method || 'Method not recorded'}</small></div>
        <span className="tag">Received</span>
      </div>
      <p className="payment-reference">{p.transaction_reference ? 'Transaction · ' + p.transaction_reference : 'Transaction reference not recorded'}</p>
      {p.reference && <p className="subtext">Original invoice reference · {p.reference}</p>}
      {p.notes && <p className="subtext">{p.notes}</p>}
      <div className="payment-document-actions">
        <button type="button" className="small" onClick={() => studio.open('Correct payment', <PaymentForm payment={p} />)}>Edit payment</button>
      </div>
    </article>
  )
}

function PricingGroups({ client: c }: { client: Client }) {
  const studio = useStudio()
  const { data } = studio
  const packages = data.packagesOf(c.id)
  return (
    <section className="panel">
      <div className="section-header"><h2>Event pricing</h2><button className="small" onClick={() => studio.open('Booking details', <PackageForm clientId={c.id} />)}>＋ Pricing group</button></div>
      {!packages.length && <p className="subtext">Booking details are needed to link existing receipts. Add a pricing group for the client’s events.</p>}
      {packages.map(p => {
        const paid = data.packagePaid(p.id)
        const balance = data.packageBalance(p)
        return (
          <article className="package-card" key={p.id}>
            <h3>{p.name}</h3>
            <p className="subtext">{p.events.map(id => data.event(id)).filter(e => e).map(e => <span key={e!.id}>{e!.type} · {Format.date(e!.event_date)}<br /></span>)}</p>
            <div className="line-items"><span>Original rate</span><strong>{Format.money(p.price)}</strong></div>
            <div className="line-items"><span>Discount</span><strong>{Format.money(p.discount)}</strong></div>
            <div className="line-items"><span>Final package</span><strong>{Format.money(p.price - p.discount)}</strong></div>
            <div className="line-items"><span>Received / Balance</span><strong>{Format.money(paid)} / {Format.money(balance)}</strong></div>
            <Tag value={balance === 0 ? 'Paid' : paid ? 'Partially Paid' : 'Unpaid'} />
            {p.items.length > 0 && <p className="subtext">{p.items.filter(i => i.kind === 'deliverable').map(i => i.label).join(' · ')}</p>}
            <div className="actions"><button className="small" onClick={() => studio.open('Edit booking', <PackageForm clientId={c.id} pkg={p} />)}>Edit booking</button></div>
          </article>
        )
      })}
    </section>
  )
}

function Notes({ client: c }: { client: Client }) {
  const studio = useStudio()
  const [notes, setNotes] = useState(c.notes || '')
  const save = () => studio.save(() => studio.api.patch(`/clients/${c.id}`, { notes: notes || null }), 'Note saved', true).catch(e => studio.toast(e.message))
  return (
    <section className="panel inline">
      <h2>Client notes</h2>
      <p className="inline-hint">Ideas, preferences & the details to remember.</p>
      <Field name="notes" label="Notes" value={notes} type="textarea" onChange={setNotes} />
      <button className="primary" onClick={save}>Save note</button>
    </section>
  )
}
