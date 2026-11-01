import { useCallback, useEffect, useState } from 'react'
import { Pricing } from '@framewise/shared/pricing.ts'
import { useStudio } from '../data/studio-context.tsx'
import { Field } from '../ui/field.tsx'
import { Format } from '../ui/format.ts'
import { Empty } from '../ui/icon.tsx'
import { useSubmit } from '../ui/use-submit.ts'

interface CatalogService { id: string; name: string; tag: string | null; price: number; active: boolean }
interface PackageTemplate { id: string; name: string; price: number; use_service_prices: boolean; active: boolean; services: Omit<CatalogService, 'active'>[] }

export function PackageTemplatesPage() {
  const studio = useStudio()
  const [packages, setPackages] = useState<PackageTemplate[] | null>(null)
  const [services, setServices] = useState<CatalogService[]>([])
  const [error, setError] = useState('')
  const load = useCallback(async () => {
    try {
      const [p, s] = await Promise.all([studio.api.get<PackageTemplate[]>('/package-templates'), studio.api.get<CatalogService[]>('/services')])
      setPackages(p)
      setServices(s)
      setError('')
    } catch (err) { setError((err as Error).message) }
  }, [studio.api])
  useEffect(() => { void load() }, [load])
  const edit = (pkg?: PackageTemplate) => studio.open(pkg ? 'Edit package' : 'Add package', <PackageTemplateForm pkg={pkg} services={services} reload={load} />)
  const toggle = async (pkg: PackageTemplate) => {
    try { await studio.api.patch(`/package-templates/${pkg.id}`, { active: !pkg.active }); await load() }
    catch (err) { setError((err as Error).message) }
  }
  const remove = (pkg: PackageTemplate) => studio.open('Delete package?', <><p>Delete “{pkg.name}” from your packages? Clients already using it keep their own copy.</p><div className="modal-footer"><button onClick={studio.close}>Cancel</button><button className="danger" onClick={async () => {
    try { await studio.api.delete(`/package-templates/${pkg.id}`); studio.close(); await load(); studio.toast('Package deleted') }
    catch (err) { studio.toast((err as Error).message) }
  }}>Delete package</button></div></>)
  return <>
    <a className="back" href="#/setup">← Setup</a>
    <div className="heading workspace-heading"><div><span className="workspace-kicker">Setup / Studio</span><h1>Packages</h1><p className="subtext">Reusable packages built from your services.</p></div><button className="primary" onClick={() => edit()}>＋ Add package</button></div>
    <div className="workspace-list-heading"><h2>Package catalog</h2>{packages && <span>{packages.length} {packages.length === 1 ? 'package' : 'packages'}</span>}</div>
    {error && <p className="form-error" role="alert">{error}</p>}
    {!packages && !error && <p className="subtext">Loading packages…</p>}
    {packages?.length === 0 && <Empty title="No packages yet" text="Add your first package to build your catalog."><button onClick={() => edit()}>Add package</button></Empty>}
    {packages && packages.length > 0 && <div className="terms-list">{packages.map(pkg => <article className="term-card" key={pkg.id}>
      <div className="term-card-head"><div><h2>{pkg.name}</h2><span className={pkg.active ? 'term-status' : 'term-status hidden-status'}>{pkg.active ? 'Active' : 'Inactive'}</span></div><div className="term-actions"><button className="small" onClick={() => void toggle(pkg)}>{pkg.active ? 'Deactivate' : 'Activate'}</button><button className="small" onClick={() => edit(pkg)}>Edit</button><button className="small danger" onClick={() => remove(pkg)}>Delete</button></div></div>
      <p><strong className="money">{Format.money(pkg.price)}</strong>{pkg.use_service_prices && <span className="subtext"> · total of its services</span>}</p>
      {pkg.services.length > 0 && <p className="subtext">{pkg.services.map(s => s.name).join(' · ')}</p>}
    </article>)}</div>}
  </>
}

function PackageTemplateForm({ pkg, services, reload }: { pkg?: PackageTemplate; services: CatalogService[]; reload: () => Promise<void> }) {
  const studio = useStudio()
  const [chosen, setChosen] = useState<string[]>(pkg?.services.map(s => s.id) ?? [])
  const [usePrices, setUsePrices] = useState(pkg?.use_service_prices ?? true)
  const byId = new Map(services.map(s => [s.id, s]))
  const included = chosen.flatMap(id => byId.get(id) ?? [])
  const addable = services.filter(s => s.active && !chosen.includes(s.id))
  const { error, busy, onSubmit } = useSubmit(async fd => {
    const body = { name: fd.get('name'), service_ids: chosen, use_service_prices: usePrices, ...(usePrices ? {} : { price: Number(fd.get('price') || 0) }) }
    if (pkg) await studio.api.patch(`/package-templates/${pkg.id}`, body)
    else await studio.api.post('/package-templates', body)
    studio.close()
    await reload()
    studio.toast(pkg ? 'Package updated' : 'Package added')
  })
  return <form autoComplete="off" onSubmit={onSubmit}>
    <p className="form-error" role="alert">{error}</p>
    <div className="field-grid">
      <Field name="name" label="Package name" value={pkg?.name} placeholder="e.g. Gold" required wide />
      <div className="field wide">
        <label htmlFor="package-add-service">Services</label>
        {services.length === 0
          ? <p className="subtext">No services yet. Add them under <a href="#/setup-services" onClick={studio.close} style={{ textDecoration: 'underline' }}>Setup › Services</a> first.</p>
          : <select id="package-add-service" value="" disabled={!addable.length} onChange={e => e.target.value && setChosen([...chosen, e.target.value])}>
              <option value="">{addable.length ? '＋ Add a service' : 'All services added'}</option>
              {addable.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>}
      </div>
      <label className="wide" style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '0 0 12px' }}>
        <input type="checkbox" checked={usePrices} onChange={e => setUsePrices(e.target.checked)} style={{ width: 18, height: 18, minHeight: 0, margin: 0 }} />
        Import services with price
      </label>
      {included.length > 0 && <ul className="wide" style={{ listStyle: 'none', padding: 0, margin: '0 0 12px' }}>
        {included.map(s => <li key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--line)' }}>
          <span style={{ flex: 1 }}>{s.name}</span>
          {usePrices && <span className="money">{Format.money(s.price)}</span>}
          <button type="button" className="small" aria-label={`Remove ${s.name}`} onClick={() => setChosen(chosen.filter(id => id !== s.id))}>×</button>
        </li>)}
      </ul>}
      {usePrices
        ? <p className="wide" style={{ display: 'flex', justifyContent: 'space-between', margin: '0 0 12px' }}><span>Package price</span><strong className="money">{Format.money(Pricing.servicesTotal(included.map(s => s.price)))}</strong></p>
        : <Field name="price" label="Package price (₹)" value={pkg?.price ?? 0} type="number" required wide />}
    </div>
    <div className="modal-footer"><button type="button" onClick={studio.close}>Cancel</button><button type="submit" className="primary" disabled={busy}>{pkg ? 'Save changes' : 'Add package'}</button></div>
  </form>
}
