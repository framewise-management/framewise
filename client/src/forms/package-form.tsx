import { useStudio } from '../data/studio-context.tsx'
import type { Package } from '../data/types.ts'
import { Field } from '../ui/field.tsx'
import { Format } from '../ui/format.ts'
import { useSubmit } from '../ui/use-submit.ts'

// a pricing group: one price for a set of the client's event days, with its deliverables
export function PackageForm({ clientId, pkg }: { clientId: string; pkg?: Package }) {
  const studio = useStudio()
  const { data } = studio
  const available = data.eventsOf(clientId).filter(e => !e.package_id || e.package_id === pkg?.id)
  const { error, busy, onSubmit } = useSubmit(async fd => {
    const events = fd.getAll('events') as string[]
    if (!events.length) throw new Error('Select at least one event for this price')
    const body: Record<string, unknown> = { name: fd.get('name'), price: Number(fd.get('price') || 0), discount: Number(fd.get('discount') || 0), bill_to: fd.get('bill_to') || null, events }
    if (!pkg) Object.assign(body, { deliverables: lines(fd.get('deliverables')), complimentary: lines(fd.get('complimentary')) })
    await studio.save(() => (pkg ? studio.api.patch(`/packages/${pkg.id}`, body) : studio.api.post(`/clients/${clientId}/packages`, body)), 'Package saved')
  })
  return (
    <form autoComplete="off" onSubmit={onSubmit}>
      <p className="form-error" role="alert">{error}</p>
      <div className="field-grid">
        <Field name="name" label="Booking description" value={pkg?.name} required />
        <Field name="price" label="Original rate" value={pkg?.price ?? 0} type="number" required />
        <Field name="discount" label="Discount" value={pkg?.discount ?? 0} type="number" required />
        <Field name="bill_to" label="Invoice billed to" value={pkg?.bill_to} />
        {pkg
          ? <p className="wide subtext">{pkg.items.length} delivery items. Edit descriptions and quantities in Delivery to keep progress.</p>
          : <>
            <Field name="deliverables" label="Deliverables (one per line)" type="textarea" />
            <Field name="complimentary" label="Complimentary items (one per line)" type="textarea" />
          </>}
      </div>
      <h3>Select events for this price</h3>
      <p className="subtext">Events already priced in another group are excluded.</p>
      {available.map(e => (
        <label className="task-check" key={e.id}><input type="checkbox" name="events" value={e.id} defaultChecked={e.package_id === pkg?.id && !!pkg} />{e.type} · {Format.date(e.event_date)}</label>
      ))}
      <div className="modal-footer">
        <button type="button" onClick={studio.close}>Cancel</button>
        <button type="submit" className="primary" disabled={busy}>Save pricing group</button>
      </div>
    </form>
  )
}

function lines(value: FormDataEntryValue | null): string[] {
  return String(value || '').split('\n').map(x => x.trim()).filter(Boolean)
}
