import { Booking } from '@framewise/shared/booking.ts'
import { StudioLists } from '@framewise/shared/studio-lists.ts'
import { useStudio } from '../data/studio-context.tsx'
import type { Client } from '../data/types.ts'
import { Field } from '../ui/field.tsx'
import { useSubmit } from '../ui/use-submit.ts'

// editing an existing client; new clients come from NewClientForm
export function ClientForm({ client }: { client: Client }) {
  const studio = useStudio()
  const hasPackages = studio.data.packagesOf(client.id).length > 0
  const { error, busy, onSubmit } = useSubmit(async fd => {
    const body: Record<string, unknown> = {
      name: fd.get('name'), bride: fd.get('bride') || null, groom: fd.get('groom') || null, lead_source: fd.get('lead_source'),
      budget: fd.get('budget'), phone: fd.get('phone') || null, email: fd.get('email') || null, address: fd.get('address') || null,
      wedding_date: fd.get('wedding_date') || null, status: fd.get('status'), due: fd.get('due') || null, notes: fd.get('notes') || null,
    }
    if (!hasPackages) Object.assign(body, { price: Number(fd.get('price') || 0), discount: Number(fd.get('discount') || 0), finance_mode: fd.get('finance_mode') })
    await studio.save(() => studio.api.patch(`/clients/${client.id}`, body), 'Client saved')
  })
  return (
    <form autoComplete="off" onSubmit={onSubmit}>
      <p className="form-error" role="alert">{error}</p>
      <div className="field-grid">
        <Field name="name" label="Couple / client name" value={client.name} required />
        <Field name="bride" label="Bride name" value={client.bride} />
        <Field name="groom" label="Groom name" value={client.groom} />
        <Field name="lead_source" label="Lead source" value={client.lead_source || 'Others'} options={StudioLists.leadSources} />
        <Field name="budget" label="Budget" value={client.budget || 'Agreed'} options={StudioLists.budgets} />
        <Field name="phone" label="Phone" value={client.phone} type="tel" />
        <Field name="email" label="Email" value={client.email} type="email" />
        <Field name="wedding_date" label="Wedding date" value={client.wedding_date} type="date" />
        <Field name="address" label="Address" value={client.address} />
        {hasPackages
          ? <p className="wide subtext">Prices are set per pricing group, under Payments.</p>
          : <>
            <Field name="price" label="Booking amount (₹)" value={client.price} type="number" required />
            <Field name="discount" label="Discount (₹)" value={client.discount} type="number" required />
            <Field name="finance_mode" label="Finance structure" value={client.finance_mode} options={[['Shared', 'One quotation for all days'], ['Per day', 'Separate quotations per day']]} />
          </>}
        <Field name="status" label="Status" value={client.status} options={Booking.clientStatuses} />
        <Field name="due" label="Payment due" value={client.due} type="date" />
        <Field name="notes" label="Notes" value={client.notes} type="textarea" />
      </div>
      <div className="modal-footer">
        <button type="button" onClick={studio.close}>Cancel</button>
        <button type="submit" className="primary" disabled={busy}>Save changes</button>
      </div>
    </form>
  )
}
