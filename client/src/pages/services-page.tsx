import { useCallback, useEffect, useState } from 'react'
import { StudioLists } from '@framewise/shared/studio-lists.ts'
import { useStudio } from '../data/studio-context.tsx'
import { Field } from '../ui/field.tsx'
import { Format } from '../ui/format.ts'
import { Empty, Tag } from '../ui/icon.tsx'
import { useSubmit } from '../ui/use-submit.ts'

interface CatalogService { id: string; name: string; tag: string | null; price: number; active: boolean }

export function ServicesPage() {
  const studio = useStudio()
  const [services, setServices] = useState<CatalogService[] | null>(null)
  const [error, setError] = useState('')
  const load = useCallback(async () => {
    try { setServices(await studio.api.get<CatalogService[]>('/services')); setError('') }
    catch (err) { setError((err as Error).message) }
  }, [studio.api])
  useEffect(() => { void load() }, [load])
  const edit = (service?: CatalogService) => studio.open(service ? 'Edit service' : 'Add service', <ServiceForm service={service} reload={load} />)
  const toggle = async (service: CatalogService) => {
    try { await studio.api.patch(`/services/${service.id}`, { active: !service.active }); await load() }
    catch (err) { setError((err as Error).message) }
  }
  const remove = (service: CatalogService) => studio.open('Delete service?', <><p>Delete “{service.name}” from your services?</p><div className="modal-footer"><button onClick={studio.close}>Cancel</button><button className="danger" onClick={async () => {
    try { await studio.api.delete(`/services/${service.id}`); studio.close(); await load(); studio.toast('Service deleted') }
    catch (err) { studio.toast((err as Error).message) }
  }}>Delete service</button></div></>)
  return <>
    <a className="back" href="#/setup">← Setup</a>
    <div className="heading workspace-heading"><div><span className="workspace-kicker">Setup / Studio</span><h1>Services</h1><p className="subtext">What you offer, with its price.</p></div><button className="primary" onClick={() => edit()}>＋ Add service</button></div>
    <div className="workspace-list-heading"><h2>Service catalog</h2>{services && <span>{services.length} {services.length === 1 ? 'service' : 'services'}</span>}</div>
    {error && <p className="form-error" role="alert">{error}</p>}
    {!services && !error && <p className="subtext">Loading services…</p>}
    {services?.length === 0 && <Empty title="No services yet" text="Add your first service to build your catalog."><button onClick={() => edit()}>Add service</button></Empty>}
    {services && services.length > 0 && <div className="terms-list">{services.map(service => <article className="term-card" key={service.id}>
      <div className="term-card-head"><div><h2>{service.name}</h2><span className={service.active ? 'term-status' : 'term-status hidden-status'}>{service.active ? 'Active' : 'Inactive'}</span></div><div className="term-actions"><button className="small" onClick={() => void toggle(service)}>{service.active ? 'Deactivate' : 'Activate'}</button><button className="small" onClick={() => edit(service)}>Edit</button><button className="small danger" onClick={() => remove(service)}>Delete</button></div></div>
      <p><strong className="money">{Format.money(service.price)}</strong>{service.tag && <> <Tag value={service.tag} /></>}</p>
    </article>)}</div>}
  </>
}

function ServiceForm({ service, reload }: { service?: CatalogService; reload: () => Promise<void> }) {
  const studio = useStudio()
  const { error, busy, onSubmit } = useSubmit(async fd => {
    const body = { name: fd.get('name'), tag: fd.get('tag') || null, price: Number(fd.get('price') || 0) }
    if (service) await studio.api.patch(`/services/${service.id}`, body)
    else await studio.api.post('/services', body)
    studio.close()
    await reload()
    studio.toast(service ? 'Service updated' : 'Service added')
  })
  return <form autoComplete="off" onSubmit={onSubmit}><p className="form-error" role="alert">{error}</p><div className="field-grid"><Field name="name" label="Service name" value={service?.name} placeholder="e.g. Candid" required /><Field name="price" label="Price (₹)" value={service?.price ?? 0} type="number" required /><div className="field wide"><label htmlFor="service-tag">Tag (optional)</label><input id="service-tag" name="tag" list="service-tags" defaultValue={service?.tag ?? ''} placeholder="e.g. Photography" autoComplete="off" /><datalist id="service-tags">{StudioLists.serviceTags.map(t => <option key={t} value={t} />)}</datalist></div></div><div className="modal-footer"><button type="button" onClick={studio.close}>Cancel</button><button type="submit" className="primary" disabled={busy}>{service ? 'Save changes' : 'Add service'}</button></div></form>
}
