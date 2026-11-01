import { useStudio } from '../data/studio-context.tsx'
import type { Enquiry } from '../data/types.ts'
import { Field } from '../ui/field.tsx'
import { useSubmit } from '../ui/use-submit.ts'

export function EnquiryForm({ enquiry }: { enquiry?: Enquiry }) {
  const studio = useStudio()
  const v = enquiry ?? ({} as Partial<Enquiry>)
  const { error, busy, onSubmit } = useSubmit(async fd => {
    const body = {
      name: fd.get('name'), bride: fd.get('bride') || null, groom: fd.get('groom') || null,
      phone: fd.get('phone') || null, email: fd.get('email') || null, wedding_date: fd.get('wedding_date') || null,
      city: fd.get('city') || null, price: Number(fd.get('price') || 0),
      notes: fd.get('notes') || null,
    }
    let created: Enquiry | undefined
    await studio.save(async () => {
      if (enquiry) await studio.api.patch(`/enquiries/${enquiry.id}`, body)
      else created = await studio.api.post<Enquiry>('/enquiries', body)
    }, enquiry ? 'Enquiry saved' : 'Enquiry and client created')
    if (created?.client_id) location.hash = '#/clients/' + created.client_id
  })
  return (
    <form autoComplete="off" onSubmit={onSubmit}>
      <p className="form-error" role="alert">{error}</p>
      <div className="field-grid">
        <Field name="name" label="Couple / client name" value={v.name} required />
        <Field name="bride" label="Bride name" value={v.bride} />
        <Field name="groom" label="Groom name" value={v.groom} />
        <Field name="phone" label="Phone" value={v.phone} type="tel" />
        <Field name="email" label="Email" value={v.email} type="email" />
        <Field name="wedding_date" label="Wedding date" value={v.wedding_date} type="date" />
        <Field name="city" label="City" value={v.city} />
        <Field name="price" label="Booking amount (₹)" value={v.price ?? 0} type="number" required />
        <Field name="notes" label="Notes" value={v.notes} type="textarea" />
      </div>
      <div className="modal-footer">
        <button type="button" onClick={studio.close}>Cancel</button>
        <button type="submit" className="primary" disabled={busy}>{enquiry ? 'Save changes' : 'Add enquiry'}</button>
      </div>
    </form>
  )
}
