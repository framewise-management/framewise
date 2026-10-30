import { useState } from 'react'
import { PaymentStages } from '@framewise/shared/payment-stages.ts'
import { StudioLists } from '@framewise/shared/studio-lists.ts'
import { useStudio } from '../data/studio-context.tsx'
import type { Payment } from '../data/types.ts'
import { Field } from '../ui/field.tsx'
import { Format } from '../ui/format.ts'
import { useSubmit } from '../ui/use-submit.ts'

// payments are corrected, never deleted; the server re-checks every balance
export function PaymentForm({ payment, clientId = '', stage }: { payment?: Payment; clientId?: string; stage?: string }) {
  const studio = useStudio()
  const { data } = studio
  const [client, setClient] = useState(payment?.client_id ?? clientId)
  const [pkg, setPkg] = useState(payment?.package_id ?? '')
  const [event, setEvent] = useState(payment?.event_id ?? '')
  const startStage = payment?.stage ?? stage ?? 'Booking Amount'
  const stages = [...new Set([...PaymentStages.core, startStage, 'Custom'])]
  const [stageChoice, setStageChoice] = useState(startStage)
  const packages = data.packagesOf(client)
  const chosenPackage = packages.length === 1 ? packages[0].id : pkg
  const own = (amountOf: (p: Payment) => boolean) => (payment && amountOf(payment) ? payment.amount : 0)

  const { error, busy, onSubmit } = useSubmit(async fd => {
    const custom = String(fd.get('custom_stage') || '').trim()
    if (stageChoice === 'Custom' && !custom) throw new Error('Enter a custom payment stage')
    const date = fd.get('paid_on') as string
    const body = {
      client_id: client, package_id: chosenPackage || null, event_id: event || null, amount: Number(fd.get('amount')),
      paid_on: date || null,
      stage: stageChoice === 'Custom' ? custom : stageChoice, method: fd.get('method'),
      transaction_reference: fd.get('transaction_reference') || null, notes: fd.get('notes') || null,
      ...(payment ? { invoice_requested: fd.get('invoice_requested') === 'Yes' } : {}),
    }
    await studio.save(() => (payment ? studio.api.patch(`/payments/${payment.id}`, body) : studio.api.post('/payments', body)), payment ? 'Payment corrected' : 'Payment recorded')
  })

  const hint = !client
    ? 'Select a client to see the outstanding balance'
    : `Client balance: ${Format.money(data.balance(client) + own(p => p.client_id === client))}`
      + (chosenPackage ? ` · Booking balance: ${Format.money(data.packageBalance(packages.find(p => p.id === chosenPackage)!) + own(p => p.package_id === chosenPackage))}` : '')

  return (
    <form autoComplete="off" onSubmit={onSubmit}>
      <p className="form-error" role="alert">{error}</p>
      <div className="field-grid">
        <Field name="client_id" label="Client" value={client} required onChange={v => { setClient(v); setPkg(''); setEvent('') }}
          options={[['', 'Select a client'], ...data.clients.map(c => [c.id, `${c.name} · ${c.code}`] as const)]} />
        {packages.length > 1 && <Field name="package_id" label="Apply to booking / invoice" value={pkg} onChange={setPkg}
          options={[['', 'Select booking / invoice'], ...packages.map(p => [p.id, p.name + (p.invoice_reference ? ' · ' + p.invoice_reference : '')] as const)]} />}
        <Field name="amount" label="Payment amount (₹)" value={payment?.amount ?? ''} type="number" min={1} required />
        <Field name="paid_on" label="Payment date" value={payment ? payment.paid_on : studio.today} type="date" required={!payment} />
        <Field name="event_id" label="Apply to event" value={event} onChange={setEvent}
          options={[['', 'All client events'], ...data.eventsOf(client).filter(e => !chosenPackage || e.package_id === chosenPackage).map(e => [e.id, `${e.type} · ${Format.date(e.event_date)}`] as const)]} />
        <Field name="stage" label="Payment stage" value={stageChoice} options={stages} onChange={setStageChoice} />
        {stageChoice === 'Custom' && <Field name="custom_stage" label="Custom stage name" required />}
        <Field name="transaction_reference" label="Transaction reference" value={payment?.transaction_reference} placeholder="UPI / bank transaction ID (optional)" />
        <Field name="method" label="Method" value={payment?.method ?? 'UPI'} options={StudioLists.paymentMethods} />
        {payment && <Field name="invoice_requested" label="Previously sent invoice" value={payment.invoice_requested ? 'Yes' : 'No'} options={['No', 'Yes']} />}
        <Field name="notes" label="Payment notes" value={payment?.notes} type="textarea" />
        <p className="note wide">{hint}</p>
      </div>
      <div className="modal-footer">
        <button type="button" onClick={studio.close}>Cancel</button>
        <button type="submit" className="primary" disabled={busy}>{payment ? 'Save correction' : 'Add payment'}</button>
      </div>
    </form>
  )
}
